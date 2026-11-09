import Order from '../../models/order.js';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { HTTP_STATUS } from '../../constants/httpStatus.js';

function toNum(d) {
  if (d == null) return 0;
  return parseFloat(d.toString());
}

/**
 * Builds the date range and MongoDB match filter based on query parameters.
 */
function buildSalesFilter(query) {
  const filter = query.filter || 'daily';
  const status = query.status || 'all';
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

  // Base match: exclude failed payments
  // For delivered orders: include all payment statuses except failed (COD pending is fine for delivered)
  // For active orders (placed/processing/shipped): only include orders where payment is confirmed (paid)
  //   OR the order is COD (payment_method = 'cod'/'cash_on_delivery') which will be collected
  const match = {};

  if (status && status !== 'all') {
    match.order_status = status;
    // For non-delivered active statuses, show paid (online) + pending (COD) orders — exclude failed only
    match.payment_status = { $ne: 'failed' };
  } else {
    // 'all' — show everything except cancelled, returned, and failed payments
    match.order_status = { $nin: ['cancelled', 'returned'] };
    match.payment_status = { $ne: 'failed' };
  }

  if (startDate && endDate) {
    match.placed_at = { $gte: startDate, $lte: endDate };
  } else if (startDate) {
    match.placed_at = { $gte: startDate };
  } else if (endDate) {
    match.placed_at = { $lte: endDate };
  }

  return { match, filter, status, startDate, endDate, customFrom, customTo };
}

// ── GET /admin/sales-report ──────────────────────────────────────────────────
export const getSalesReport = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 10);

    const { match, filter, status, startDate, endDate, customFrom, customTo } = buildSalesFilter(req.query);

    // Revenue categorization expressions
    const isCodExpr = {
      $regexMatch: {
        input: { $ifNull: ['$payment_method', ''] },
        regex: /cod|cash/i,
      },
    };

    const isPrepaidPaidExpr = {
      $and: [
        { $not: isCodExpr },
        { $regexMatch: { input: { $ifNull: ['$payment_status', ''] }, regex: /^paid$/i } },
        {
          $in: [
            { $toLower: { $ifNull: ['$order_status', ''] } },
            ['placed', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered'],
          ],
        },
      ],
    };

    const isCodDeliveredExpr = {
      $and: [
        isCodExpr,
        { $regexMatch: { input: { $ifNull: ['$order_status', ''] }, regex: /^delivered$/i } },
      ],
    };

    const isNetRevenueExpr = {
      $or: [isPrepaidPaidExpr, isCodDeliveredExpr],
    };

    const isPendingCodExpr = {
      $and: [
        isCodExpr,
        {
          $in: [
            { $toLower: { $ifNull: ['$order_status', ''] } },
            ['placed', 'confirmed', 'processing', 'shipped', 'out_for_delivery'],
          ],
        },
      ],
    };

    const netAmountExpr = {
      $subtract: ['$total_amount', { $ifNull: ['$refunded_amount', 0] }],
    };

    const [result] = await Order.aggregate([
      { $match: match },
      {
        $facet: {
          summary: [
            {
              $group: {
                _id: null,
                overallSalesCount: {
                  $sum: {
                    $cond: [isNetRevenueExpr, 1, 0],
                  },
                },
                totalOrderAmount: {
                  $sum: {
                    $cond: [isNetRevenueExpr, netAmountExpr, 0],
                  },
                },
                pendingCodAmount: {
                  $sum: {
                    $cond: [isPendingCodExpr, netAmountExpr, 0],
                  },
                },
                pendingCodCount: {
                  $sum: {
                    $cond: [isPendingCodExpr, 1, 0],
                  },
                },
                totalDiscount: {
                  $sum: {
                    $cond: [isNetRevenueExpr, '$discount_amount', 0],
                  },
                },
                totalCouponDeductions: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          isNetRevenueExpr,
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
                refunded_amount: 1,
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
      pendingCodAmount: toNum(summaryRaw.pendingCodAmount),
      pendingCodCount: summaryRaw.pendingCodCount || 0,
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

      const method = (o.payment_method || '').toLowerCase();
      const isCod = method.includes('cod') || method.includes('cash');
      const orderSt = (o.order_status || '').toLowerCase();
      const paySt = (o.payment_status || '').toLowerCase();

      const isPrepaidPaid = !isCod && paySt === 'paid' && ['placed', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered'].includes(orderSt);
      const isCodDelivered = isCod && orderSt === 'delivered';
      const isPendingCod = isCod && ['placed', 'confirmed', 'processing', 'shipped', 'out_for_delivery'].includes(orderSt);
      const isNetRevenue = isPrepaidPaid || isCodDelivered;

      return {
        _id: o._id,
        order_number: o.order_number,
        placed_at: o.placed_at,
        customerName,
        customerEmail,
        amount: toNum(o.total_amount) - toNum(o.refunded_amount),
        discount: toNum(o.discount_amount),
        coupon_code: o.coupon_code || null,
        order_status: o.order_status,
        payment_status: o.payment_status,
        payment_method: o.payment_method || '—',
        isNetRevenue,
        isPendingCod,
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
      status,
      customFrom,
      customTo,
      startDate,
      endDate,
    });
  } catch (err) {
    console.error('getSalesReport error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send('Server error generating sales report');
  }
};

// ── GET /admin/sales-report/download/pdf ──────────────────────────────────────
export const downloadPdf = async (req, res) => {
  try {
    const { match, filter, status, customFrom, customTo } = buildSalesFilter(req.query);

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

    let overallSalesCount = 0;
    let totalOrderAmount = 0;
    let pendingCodAmount = 0;
    let totalDiscount = 0;
    let totalCouponDeductions = 0;

    const rows = ordersRaw.map((o) => {
      const amt = toNum(o.total_amount) - toNum(o.refunded_amount);
      const disc = toNum(o.discount_amount);

      const method = (o.payment_method || '').toLowerCase();
      const isCod = method.includes('cod') || method.includes('cash');
      const orderSt = (o.order_status || '').toLowerCase();
      const paySt = (o.payment_status || '').toLowerCase();

      const isPrepaidPaid = !isCod && paySt === 'paid' && ['placed', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered'].includes(orderSt);
      const isCodDelivered = isCod && orderSt === 'delivered';
      const isPendingCod = isCod && ['placed', 'confirmed', 'processing', 'shipped', 'out_for_delivery'].includes(orderSt);
      const isNetRevenue = isPrepaidPaid || isCodDelivered;

      if (isNetRevenue) {
        overallSalesCount++;
        totalOrderAmount += amt;
        totalDiscount += disc;
        if (o.coupon_code) totalCouponDeductions += disc;
      } else if (isPendingCod) {
        pendingCodAmount += amt;
      }

      const customerName = (o.customer && o.customer.full_name) ||
        (o.shipping_address && o.shipping_address.full_name) ||
        'Customer';

      const typeText = isPendingCod ? 'Pending COD' : (isNetRevenue ? 'Revenue' : 'Excluded');
      const typeColor = isPendingCod ? '#b45309' : (isNetRevenue ? '#15803d' : '#6b7280');

      return {
        date: o.placed_at ? new Date(o.placed_at).toLocaleDateString('en-IN') : '—',
        orderNumber: o.order_number,
        customer: customerName,
        amount: amt,
        discount: disc,
        coupon: o.coupon_code || '—',
        typeText,
        typeColor,
      };
    });

    let filterLabel = filter.toUpperCase();
    if (filter === 'daily') filterLabel = 'DAILY (TODAY)';
    else if (filter === 'weekly') filterLabel = 'WEEKLY (LAST 7 DAYS)';
    else if (filter === 'yearly') filterLabel = 'YEARLY (THIS YEAR)';
    else if (filter === 'custom') filterLabel = `CUSTOM (${customFrom || 'Start'} TO ${customTo || 'End'})`;
    else if (filter === 'all') filterLabel = 'ALL TIME';

    let statusLabel = status.toUpperCase().replace(/_/g, ' ');
    if (status === 'delivered') statusLabel = 'DELIVERED (COMPLETED SALES)';
    else if (status === 'all') statusLabel = 'ALL ACTIVE ORDERS';
    else if (status === 'placed') statusLabel = 'PLACED';
    else if (status === 'processing') statusLabel = 'PROCESSING';
    else if (status === 'shipped') statusLabel = 'SHIPPED';
    else if (status === 'out_for_delivery') statusLabel = 'OUT FOR DELIVERY';

    const doc = new PDFDocument({ margin: 40, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="sales-report-${filter}-${status}-${Date.now()}.pdf"`
    );

    doc.pipe(res);

    // Header Branding
    doc.fontSize(22).font('Helvetica-Bold').text('ESSENCE', 40, 40);
    doc.fontSize(10).font('Helvetica').fillColor('#666').text('Sales & Revenue Report', 40, 68);
    doc.fillColor('#111');

    // Filter info
    doc.fontSize(8.5).font('Helvetica-Bold').text(`FILTER: ${filterLabel} | STATUS: ${statusLabel}`, 180, 45, { width: 375, align: 'right' });
    doc.fontSize(8).font('Helvetica').fillColor('#666').text(`Generated: ${new Date().toLocaleString('en-IN')}`, 250, 58, { width: 305, align: 'right' });
    doc.fillColor('#111');

    doc.moveTo(40, 85).lineTo(555, 85).strokeColor('#e5e7eb').stroke();

    // Summary Box
    doc.rect(40, 95, 515, 65).fillColor('#f9fafb').fill().strokeColor('#e5e7eb').stroke();

    doc.fillColor('#6b7280').fontSize(7.5).font('Helvetica-Bold');
    doc.text('SALES COUNT', 50, 105);
    doc.text('NET REVENUE', 150, 105);
    doc.text('PENDING COD', 255, 105);
    doc.text('TOTAL DISCOUNT', 355, 105);
    doc.text('COUPON DED.', 455, 105);

    doc.fillColor('#111').fontSize(11).font('Helvetica-Bold');
    doc.text(`${overallSalesCount}`, 50, 122);
    doc.text(`Rs. ${totalOrderAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 150, 122);
    doc.text(`Rs. ${pendingCodAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 255, 122);
    doc.text(`Rs. ${totalDiscount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 355, 122);
    doc.text(`Rs. ${totalCouponDeductions.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 455, 122);

    // Table Header
    let y = 180;
    doc.rect(40, y, 515, 22).fillColor('#111').fill();
    doc.fillColor('#fff').fontSize(7.5).font('Helvetica-Bold');
    doc.text('DATE', 45, y + 6);
    doc.text('ORDER ID', 100, y + 6);
    doc.text('CUSTOMER', 195, y + 6);
    doc.text('TYPE', 295, y + 6, { width: 65, align: 'center' });
    doc.text('DISCOUNT', 365, y + 6, { width: 55, align: 'right' });
    doc.text('COUPON', 425, y + 6, { width: 50, align: 'center' });
    doc.text('AMOUNT', 480, y + 6, { width: 70, align: 'right' });

    y += 25;
    doc.font('Helvetica').fontSize(8).fillColor('#111');

    if (rows.length === 0) {
      doc.text('No matching orders found for the selected filter.', 45, y + 10);
    } else {
      rows.forEach((r, idx) => {
        if (y > 750) {
          doc.addPage({ margin: 40, size: 'A4' });
          y = 50;
          doc.rect(40, y, 515, 22).fillColor('#111').fill();
          doc.fillColor('#fff').fontSize(7.5).font('Helvetica-Bold');
          doc.text('DATE', 45, y + 6);
          doc.text('ORDER ID', 100, y + 6);
          doc.text('CUSTOMER', 195, y + 6);
          doc.text('TYPE', 295, y + 6, { width: 65, align: 'center' });
          doc.text('DISCOUNT', 365, y + 6, { width: 55, align: 'right' });
          doc.text('COUPON', 425, y + 6, { width: 50, align: 'center' });
          doc.text('AMOUNT', 480, y + 6, { width: 70, align: 'right' });
          y += 25;
          doc.font('Helvetica').fontSize(8).fillColor('#111');
        }

        if (idx % 2 === 1) {
          doc.rect(40, y - 3, 515, 20).fillColor('#f9fafb').fill();
        }

        doc.fillColor('#111');
        doc.text(r.date, 45, y + 3);
        doc.text(r.orderNumber, 100, y + 3);
        doc.text(r.customer.substring(0, 18), 195, y + 3);

        doc.fillColor(r.typeColor).font('Helvetica-Bold').fontSize(7.5);
        doc.text(r.typeText, 295, y + 3, { width: 65, align: 'center' });

        doc.fillColor('#111').font('Helvetica').fontSize(8);
        doc.text(r.discount > 0 ? `Rs. ${r.discount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—', 365, y + 3, { width: 55, align: 'right' });
        doc.text(r.coupon, 425, y + 3, { width: 50, align: 'center' });
        doc.text(`Rs. ${r.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 480, y + 3, { width: 70, align: 'right' });

        y += 20;
      });
    }

    doc.end();
  } catch (err) {
    console.error('downloadPdf error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send('Error generating PDF sales report');
  }
};

// ── GET /admin/sales-report/download/excel (ExcelJS .xlsx) ────────────────────
export const downloadExcel = async (req, res) => {
  try {
    const { match, filter, status, customFrom, customTo } = buildSalesFilter(req.query);

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

    let overallSalesCount = 0;
    let totalOrderAmount = 0;
    let pendingCodAmount = 0;
    let totalDiscount = 0;
    let totalCouponDeductions = 0;

    ordersRaw.forEach((o) => {
      const amt = toNum(o.total_amount) - toNum(o.refunded_amount);
      const disc = toNum(o.discount_amount);

      const method = (o.payment_method || '').toLowerCase();
      const isCod = method.includes('cod') || method.includes('cash');
      const orderSt = (o.order_status || '').toLowerCase();
      const paySt = (o.payment_status || '').toLowerCase();

      const isPrepaidPaid = !isCod && paySt === 'paid' && ['placed', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered'].includes(orderSt);
      const isCodDelivered = isCod && orderSt === 'delivered';
      const isPendingCod = isCod && ['placed', 'confirmed', 'processing', 'shipped', 'out_for_delivery'].includes(orderSt);
      const isNetRevenue = isPrepaidPaid || isCodDelivered;

      if (isNetRevenue) {
        overallSalesCount++;
        totalOrderAmount += amt;
        totalDiscount += disc;
        if (o.coupon_code) totalCouponDeductions += disc;
      } else if (isPendingCod) {
        pendingCodAmount += amt;
      }
    });

    let filterLabel = filter.toUpperCase();
    if (filter === 'daily') filterLabel = 'Daily (Today)';
    else if (filter === 'weekly') filterLabel = 'Weekly (Last 7 Days)';
    else if (filter === 'yearly') filterLabel = 'Yearly (This Year)';
    else if (filter === 'custom') filterLabel = `Custom (${customFrom || 'Start'} to ${customTo || 'End'})`;
    else if (filter === 'all') filterLabel = 'All Time';

    let statusLabel = status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    if (status === 'delivered') statusLabel = 'Delivered (Completed Sales)';
    else if (status === 'all') statusLabel = 'All Active Orders';
    else if (status === 'out_for_delivery') statusLabel = 'Out for Delivery';

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
    metaCell.value = `Filter: ${filterLabel}  |  Status: ${statusLabel}  |  Generated on: ${new Date().toLocaleString('en-IN')}`;
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
      ['Net Revenue (INR)', totalOrderAmount],
      ['Pending COD (INR)', pendingCodAmount],
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
      { header: 'Classification', key: 'classification', width: 16 },
      { header: 'Order Amount (INR)', key: 'amount', width: 18 },
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
        toNum(o.total_amount) - toNum(o.refunded_amount),
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
      `attachment; filename="sales-report-${filter}-${status}-${Date.now()}.xlsx"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('downloadExcel error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send('Error generating Excel sales report');
  }
};

export default {
  getSalesReport,
  downloadPdf,
  downloadExcel
};
