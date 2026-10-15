const Order = require('../../models/order');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

function toNum(d) {
  if (d == null) return 0;
  return parseFloat(d.toString());
}

/**
 * Builds the date range and MongoDB match filter based on query parameters.
 */
function buildSalesFilter(query) {
  const filter = query.filter || 'daily';
  const now = new Date();

  let startDate = null;
  let endDate = null;
  let customFrom = query.from || '';
  let customTo = query.to || '';

  if (filter === 'daily') {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  } else if (filter === 'weekly') {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 0, 0, 0, 0);
    endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  } else if (filter === 'yearly') {
    startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
  } else if (filter === 'custom') {
    if (customFrom) {
      const parsedFrom = new Date(customFrom);
      if (!isNaN(parsedFrom.getTime())) {
        parsedFrom.setHours(0, 0, 0, 0);
        startDate = parsedFrom;
      }
    }
    if (customTo) {
      const parsedTo = new Date(customTo);
      if (!isNaN(parsedTo.getTime())) {
        parsedTo.setHours(23, 59, 59, 999);
        endDate = parsedTo;
      }
    }
  }

  // Base match: Count only successful orders (exclude cancelled, returned, and failed)
  const match = {
    order_status: { $nin: ['cancelled', 'returned'] },
    payment_status: { $ne: 'failed' },
  };

  if (startDate && endDate) {
    match.placed_at = { $gte: startDate, $lte: endDate };
  } else if (startDate) {
    match.placed_at = { $gte: startDate };
  } else if (endDate) {
    match.placed_at = { $lte: endDate };
  }

  return { match, filter, startDate, endDate, customFrom, customTo };
}

// ── GET /admin/sales-report ──────────────────────────────────────────────────
exports.getSalesReport = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 10);

    const { match, filter, startDate, endDate, customFrom, customTo } = buildSalesFilter(req.query);

    const [result] = await Order.aggregate([
      { $match: match },
      {
        $facet: {
          summary: [
            {
              $group: {
                _id: null,
                overallSalesCount: { $sum: 1 },
                totalOrderAmount: { $sum: '$total_amount' },
                totalDiscount: { $sum: '$discount_amount' },
                totalCouponDeductions: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $ne: ['$coupon_code', null] },
                          { $ne: ['$coupon_code', ''] },
                        ],
                      },
                      '$discount_amount',
                      0,
                    ],
                  },
                },
              },
            },
          ],
          totalRecords: [
            { $count: 'count' },
          ],
          orders: [
            { $sort: { placed_at: -1 } },
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $lookup: {
                from: 'users',
                localField: 'user_id',
                foreignField: '_id',
                as: 'customer',
              },
            },
            {
              $unwind: {
                path: '$customer',
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $project: {
                _id: 1,
                order_number: 1,
                placed_at: 1,
                total_amount: 1,
                discount_amount: 1,
                coupon_code: 1,
                order_status: 1,
                payment_status: 1,
                payment_method: 1,
                shipping_address: 1,
                'customer.full_name': 1,
                'customer.email': 1,
              },
            },
          ],
        },
      },
    ]);

    const summaryRaw = (result && result.summary && result.summary[0]) || {};
    const totalCount = (result && result.totalRecords && result.totalRecords[0]?.count) || 0;
    const ordersRaw = (result && result.orders) || [];

    const summary = {
      overallSalesCount: summaryRaw.overallSalesCount || 0,
      totalOrderAmount: toNum(summaryRaw.totalOrderAmount),
      totalDiscount: toNum(summaryRaw.totalDiscount),
      totalCouponDeductions: toNum(summaryRaw.totalCouponDeductions),
    };

    const orders = ordersRaw.map((o) => {
      const customerName = (o.customer && o.customer.full_name) ||
        (o.shipping_address && o.shipping_address.full_name) ||
        'Guest Customer';
      const customerEmail = (o.customer && o.customer.email) ||
        (o.shipping_address && o.shipping_address.phone_number) ||
        '—';

      return {
        _id: o._id,
        order_number: o.order_number,
        placed_at: o.placed_at,
        customerName,
        customerEmail,
        amount: toNum(o.total_amount),
        discount: toNum(o.discount_amount),
        coupon_code: o.coupon_code || null,
        order_status: o.order_status,
        payment_status: o.payment_status,
        payment_method: o.payment_method || '—',
      };
    });

    const totalPages = Math.ceil(totalCount / limit) || 1;

    res.render('admin/salesReport/salesReport', {
      activePage: 'sales-report',
      orders,
      summary,
      currentPage: page,
      totalPages,
      totalRecords: totalCount,
      limit,
      filter,
      customFrom,
      customTo,
      startDate,
      endDate,
    });
  } catch (err) {
    console.error('getSalesReport error:', err);
    res.status(500).send('Server error generating sales report');
  }
};

// ── GET /admin/sales-report/download/pdf ──────────────────────────────────────
exports.downloadPdf = async (req, res) => {
  try {
    const { match, filter, startDate, endDate, customFrom, customTo } = buildSalesFilter(req.query);

    const ordersRaw = await Order.aggregate([
      { $match: match },
      { $sort: { placed_at: -1 } },
      {
        $lookup: {
          from: 'users',
          localField: 'user_id',
          foreignField: '_id',
          as: 'customer',
        },
      },
      {
        $unwind: {
          path: '$customer',
          preserveNullAndEmptyArrays: true,
        },
      },
    ]);

    const overallSalesCount = ordersRaw.length;
    let totalOrderAmount = 0;
    let totalDiscount = 0;
    let totalCouponDeductions = 0;

    const rows = ordersRaw.map((o) => {
      const amt = toNum(o.total_amount);
      const disc = toNum(o.discount_amount);
      totalOrderAmount += amt;
      totalDiscount += disc;
      if (o.coupon_code) totalCouponDeductions += disc;

      const customerName = (o.customer && o.customer.full_name) ||
        (o.shipping_address && o.shipping_address.full_name) ||
        'Customer';

      return {
        date: o.placed_at ? new Date(o.placed_at).toLocaleDateString('en-IN') : '—',
        orderNumber: o.order_number,
        customer: customerName,
        amount: amt.toFixed(2),
        discount: disc.toFixed(2),
        coupon: o.coupon_code || '—',
      };
    });

    let filterLabel = filter.toUpperCase();
    if (filter === 'daily') filterLabel = 'DAILY (TODAY)';
    else if (filter === 'weekly') filterLabel = 'WEEKLY (LAST 7 DAYS)';
    else if (filter === 'yearly') filterLabel = 'YEARLY (THIS YEAR)';
    else if (filter === 'custom') filterLabel = `CUSTOM (${customFrom || 'Start'} TO ${customTo || 'End'})`;
    else if (filter === 'all') filterLabel = 'ALL TIME';

    const doc = new PDFDocument({ margin: 40, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="sales-report-${filter}-${Date.now()}.pdf"`
    );

    doc.pipe(res);

    // Header Branding
    doc.fontSize(22).font('Helvetica-Bold').text('ESSENCE', 40, 40);
    doc.fontSize(10).font('Helvetica').fillColor('#666').text('Sales & Revenue Report', 40, 68);
    doc.fillColor('#111');

    // Filter info
    doc.fontSize(9).font('Helvetica-Bold').text(`FILTER: ${filterLabel}`, 250, 45, { width: 305, align: 'right' });
    doc.fontSize(8).font('Helvetica').fillColor('#666').text(`Generated: ${new Date().toLocaleString('en-IN')}`, 250, 58, { width: 305, align: 'right' });
    doc.fillColor('#111');

    doc.moveTo(40, 85).lineTo(555, 85).strokeColor('#e5e7eb').stroke();

    // Summary Box
    doc.rect(40, 95, 515, 65).fillColor('#f9fafb').fill().strokeColor('#e5e7eb').stroke();

    doc.fillColor('#6b7280').fontSize(8).font('Helvetica-Bold');
    doc.text('TOTAL ORDERS', 55, 105);
    doc.text('TOTAL REVENUE', 185, 105);
    doc.text('TOTAL DISCOUNT', 315, 105);
    doc.text('COUPON DEDUCTIONS', 430, 105);

    doc.fillColor('#111').fontSize(13).font('Helvetica-Bold');
    doc.text(`${overallSalesCount}`, 55, 122);
    doc.text(`Rs. ${totalOrderAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 185, 122);
    doc.text(`Rs. ${totalDiscount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 315, 122);
    doc.text(`Rs. ${totalCouponDeductions.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 430, 122);

    // Table Header
    let y = 180;
    doc.rect(40, y, 515, 22).fillColor('#111').fill();
    doc.fillColor('#fff').fontSize(8).font('Helvetica-Bold');
    doc.text('DATE', 48, y + 6);
    doc.text('ORDER ID', 110, y + 6);
    doc.text('CUSTOMER', 215, y + 6);
    doc.text('AMOUNT', 340, y + 6, { width: 60, align: 'right' });
    doc.text('DISCOUNT', 415, y + 6, { width: 55, align: 'right' });
    doc.text('COUPON', 485, y + 6, { width: 60, align: 'center' });

    y += 24;
    doc.font('Helvetica').fontSize(8).fillColor('#111');

    if (rows.length === 0) {
      doc.text('No successful orders found for the selected filter.', 48, y + 10);
    } else {
      rows.forEach((r, idx) => {
        if (y > 750) {
          doc.addPage({ margin: 40, size: 'A4' });
          y = 50;
          doc.rect(40, y, 515, 22).fillColor('#111').fill();
          doc.fillColor('#fff').fontSize(8).font('Helvetica-Bold');
          doc.text('DATE', 48, y + 6);
          doc.text('ORDER ID', 110, y + 6);
          doc.text('CUSTOMER', 215, y + 6);
          doc.text('AMOUNT', 340, y + 6, { width: 60, align: 'right' });
          doc.text('DISCOUNT', 415, y + 6, { width: 55, align: 'right' });
          doc.text('COUPON', 485, y + 6, { width: 60, align: 'center' });
          y += 24;
          doc.font('Helvetica').fontSize(8).fillColor('#111');
        }

        if (idx % 2 === 1) {
          doc.rect(40, y - 2, 515, 18).fillColor('#f9fafb').fill();
        }

        doc.fillColor('#111');
        doc.text(r.date, 48, y + 2);
        doc.text(r.orderNumber, 110, y + 2);
        doc.text(r.customer.substring(0, 20), 215, y + 2);
        doc.text(`Rs. ${r.amount}`, 340, y + 2, { width: 60, align: 'right' });
        doc.text(`Rs. ${r.discount}`, 415, y + 2, { width: 55, align: 'right' });
        doc.text(r.coupon, 485, y + 2, { width: 60, align: 'center' });

        y += 18;
      });
    }

    doc.end();
  } catch (err) {
    console.error('downloadPdf error:', err);
    res.status(500).send('Error generating PDF sales report');
  }
};

// ── GET /admin/sales-report/download/excel (ExcelJS .xlsx) ────────────────────
exports.downloadExcel = async (req, res) => {
  try {
    const { match, filter, customFrom, customTo } = buildSalesFilter(req.query);

    const ordersRaw = await Order.aggregate([
      { $match: match },
      { $sort: { placed_at: -1 } },
      {
        $lookup: {
          from: 'users',
          localField: 'user_id',
          foreignField: '_id',
          as: 'customer',
        },
      },
      {
        $unwind: {
          path: '$customer',
          preserveNullAndEmptyArrays: true,
        },
      },
    ]);

    let overallSalesCount = ordersRaw.length;
    let totalOrderAmount = 0;
    let totalDiscount = 0;
    let totalCouponDeductions = 0;

    ordersRaw.forEach((o) => {
      const amt = toNum(o.total_amount);
      const disc = toNum(o.discount_amount);
      totalOrderAmount += amt;
      totalDiscount += disc;
      if (o.coupon_code) totalCouponDeductions += disc;
    });

    let filterLabel = filter.toUpperCase();
    if (filter === 'daily') filterLabel = 'Daily (Today)';
    else if (filter === 'weekly') filterLabel = 'Weekly (Last 7 Days)';
    else if (filter === 'yearly') filterLabel = 'Yearly (This Year)';
    else if (filter === 'custom') filterLabel = `Custom (${customFrom || 'Start'} to ${customTo || 'End'})`;
    else if (filter === 'all') filterLabel = 'All Time';

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Essence Luxury Perfumes';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Sales Report', {
      views: [{ showGridLines: true }],
    });

    // 1. Title & Meta
    sheet.mergeCells('A1:I1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'ESSENCE LUXURY PERFUMES — SALES REPORT';
    titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF111111' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.getRow(1).height = 30;

    sheet.mergeCells('A2:I2');
    const metaCell = sheet.getCell('A2');
    metaCell.value = `Filter: ${filterLabel}  |  Generated on: ${new Date().toLocaleString('en-IN')}`;
    metaCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF555555' } };
    metaCell.alignment = { vertical: 'middle', horizontal: 'center' };

    // 2. Summary Section
    sheet.mergeCells('A4:D4');
    const sumHeader = sheet.getCell('A4');
    sumHeader.value = 'SALES SUMMARY';
    sumHeader.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    sumHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } };
    sumHeader.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    sheet.getRow(4).height = 22;

    const summaryData = [
      ['Overall Sales Count', overallSalesCount],
      ['Total Order Amount (INR)', totalOrderAmount],
      ['Total Discount (INR)', totalDiscount],
      ['Total Coupon Deductions (INR)', totalCouponDeductions],
    ];

    summaryData.forEach((item, idx) => {
      const rowNum = 5 + idx;
      sheet.getCell(`A${rowNum}`).value = item[0];
      sheet.getCell(`A${rowNum}`).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF374151' } };
      sheet.getCell(`A${rowNum}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };

      sheet.mergeCells(`B${rowNum}:D${rowNum}`);
      const valCell = sheet.getCell(`B${rowNum}`);
      valCell.value = item[1];
      valCell.font = { name: 'Arial', size: 10, bold: true };
      if (idx > 0) valCell.numFmt = '₹#,##0.00';
    });

    // 3. Orders Table Header
    const tableHeaderRowNum = 10;
    sheet.getRow(tableHeaderRowNum).height = 24;

    const headers = [
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Order ID', key: 'orderNumber', width: 22 },
      { header: 'Customer Name', key: 'customerName', width: 22 },
      { header: 'Customer Email', key: 'customerEmail', width: 28 },
      { header: 'Payment Method', key: 'paymentMethod', width: 18 },
      { header: 'Order Status', key: 'orderStatus', width: 16 },
      { header: 'Amount (INR)', key: 'amount', width: 16 },
      { header: 'Discount (INR)', key: 'discount', width: 16 },
      { header: 'Coupon Code', key: 'couponCode', width: 16 },
    ];

    headers.forEach((h, colIdx) => {
      const colLetter = String.fromCharCode(65 + colIdx);
      const cell = sheet.getCell(`${colLetter}${tableHeaderRowNum}`);
      cell.value = h.header;
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } };
      cell.alignment = { vertical: 'middle', horizontal: colIdx >= 6 && colIdx <= 7 ? 'right' : 'left' };
      sheet.getColumn(colIdx + 1).width = h.width;
    });

    // 4. Data Rows
    let currentRowNum = tableHeaderRowNum + 1;

    ordersRaw.forEach((o, index) => {
      const row = sheet.getRow(currentRowNum);
      row.height = 20;

      const customerName = (o.customer && o.customer.full_name) ||
        (o.shipping_address && o.shipping_address.full_name) ||
        'Customer';
      const customerEmail = (o.customer && o.customer.email) ||
        (o.shipping_address && o.shipping_address.phone_number) ||
        '—';

      const isEven = index % 2 === 1;
      const rowBg = isEven ? 'FFF9FAFB' : 'FFFFFFFF';

      row.values = [
        o.placed_at ? new Date(o.placed_at).toISOString().slice(0, 10) : '—',
        o.order_number || '—',
        customerName,
        customerEmail,
        o.payment_method || '—',
        (o.order_status || '—').toUpperCase(),
        toNum(o.total_amount),
        toNum(o.discount_amount),
        o.coupon_code || '—',
      ];

      row.eachCell((cell, colNumber) => {
        cell.font = { name: 'Arial', size: 9 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        };
        if (colNumber === 7 || colNumber === 8) {
          cell.numFmt = '₹#,##0.00';
          cell.alignment = { horizontal: 'right' };
        } else if (colNumber === 9 || colNumber === 6) {
          cell.alignment = { horizontal: 'center' };
        }
      });

      currentRowNum++;
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="sales-report-${filter}-${Date.now()}.xlsx"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('downloadExcel error:', err);
    res.status(500).send('Error generating Excel sales report');
  }
};
