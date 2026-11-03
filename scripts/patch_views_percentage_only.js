/**
 * Patch EJS views to remove flat/fixed discount type references.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve('.');
function read(rel) { return readFileSync(resolve(root, rel), 'utf8'); }
function write(rel, content) { writeFileSync(resolve(root, rel), content, 'utf8'); }

// ─────────────────────────────────────────────────────────────────────────────
// A. views/admin/offers/list.ejs
//    1. Table: simplify discount display
//    2. Add modal: remove Flat Amount radio button
// ─────────────────────────────────────────────────────────────────────────────
{
  let src = read('views/admin/offers/list.ejs');

  // 1. Table discount display
  src = src.replace(
    `                      <%= o.discount_type === 'percentage' ? o.discount_value + '% Off' : '₹' + o.discount_value + ' Flat' %>`,
    `                      <%= o.discount_value %>% Off`
  );

  // 2. disc-sub: just show "percentage" label (remove dynamic type)
  src = src.replace(
    `                    <div class="disc-sub"><%= o.discount_type %></div>`,
    `                    <div class="disc-sub">percentage</div>`
  );

  // 3. Remove Flat Amount radio from Add modal
  src = src.replace(
    `              <label class="radio-label">\n                <input type="radio" name="discount_type" value="percentage" checked> Percentage\n              </label>\n              <label class="radio-label">\n                <input type="radio" name="discount_type" value="fixed"> Flat Amount\n              </label>`,
    `              <label class="radio-label">\n                <input type="radio" name="discount_type" value="percentage" checked> Percentage\n              </label>`
  );

  write('views/admin/offers/list.ejs', src);
  console.log('✅ views/admin/offers/list.ejs');
}

// ─────────────────────────────────────────────────────────────────────────────
// B. views/admin/offers/edit.ejs
//    1. Remove Flat Amount radio
//    2. Simplify discount value label (always %)
//    3. Always add max="90" to discount input
//    4. Remove conditional style on maxDiscountGroup
// ─────────────────────────────────────────────────────────────────────────────
{
  let src = read('views/admin/offers/edit.ejs');

  // 1. Remove Flat Amount radio
  src = src.replace(
    `                <label class="radio-label">\n                  <input type="radio" name="discount_type" value="percentage" <%= offer.discount_type === 'percentage' ? 'checked' : '' %>> Percentage\n                </label>\n                <label class="radio-label">\n                  <input type="radio" name="discount_type" value="fixed" <%= offer.discount_type === 'fixed' ? 'checked' : '' %>> Flat Amount\n                </label>`,
    `                <label class="radio-label">\n                  <input type="radio" name="discount_type" value="percentage" checked> Percentage\n                </label>`
  );

  // 2. Simplify label (always %)
  src = src.replace(
    `              <label id="discountValLabel">Discount Value (<%= offer.discount_type === 'percentage' ? '%' : '₹' %>) *</label>`,
    `              <label id="discountValLabel">Discount Value (%) *</label>`
  );

  // 3. Always add max="90"
  src = src.replace(
    `              <input type="number" name="discount_value" id="discountValue" step="0.01" min="1" <%= offer.discount_type === 'percentage' ? 'max="90"' : '' %> value="<%= offer.discount_value %>" required>`,
    `              <input type="number" name="discount_value" id="discountValue" step="0.01" min="1" max="90" value="<%= offer.discount_value %>" required>`
  );

  // 4. Remove conditional style on maxDiscountGroup (always visible)
  src = src.replace(
    `          <div class="form-group" id="maxDiscountGroup" style="<%= offer.discount_type === 'percentage' ? '' : 'display:none;' %>">`,
    `          <div class="form-group" id="maxDiscountGroup">`
  );

  write('views/admin/offers/edit.ejs', src);
  console.log('✅ views/admin/offers/edit.ejs');
}

// ─────────────────────────────────────────────────────────────────────────────
// C. views/admin/coupons/list.ejs
//    1. Table: simplify discount display (always percentage)
//    2. Remove "Discount Type" select from Add modal
// ─────────────────────────────────────────────────────────────────────────────
{
  let src = read('views/admin/coupons/list.ejs');

  // 1. Simplify table discount display
  src = src.replace(
    `                <div class="disc-value">\n                  <% if (c.discount_type === 'percentage') { %>\n                    <%= c.discount_value %>% OFF\n                  <% } else { %>\n                    ₹<%= c.discount_value.toLocaleString('en-IN') %> OFF\n                  <% } %>\n                </div>\n                <div class="disc-type"><%= c.discount_type %></div>`,
    `                <div class="disc-value"><%= c.discount_value %>% OFF</div>\n                <div class="disc-type">percentage</div>`
  );

  // 2. Remove Discount Type select from Add modal
  src = src.replace(
    `          <div class="form-group">\n            <label>Discount Type *</label>\n            <select name="discount_type" id="addDiscType" onchange="toggleMaxDisc('add')">\n              <option value="percentage">Percentage (%)</option>\n              <option value="fixed">Fixed Amount (₹)</option>\n            </select>\n          </div>`,
    ``
  );

  // Also fix the form hint on discount value (was "Enter % for percentage, or ₹ amount for fixed.")
  src = src.replace(
    `            <p class="form-hint">Enter % for percentage, or ₹ amount for fixed.</p>`,
    `            <p class="form-hint">Enter percentage value (e.g. 20 for 20% off).</p>`
  );

  write('views/admin/coupons/list.ejs', src);
  console.log('✅ views/admin/coupons/list.ejs');
}

// ─────────────────────────────────────────────────────────────────────────────
// D. views/admin/coupons/edit.ejs
//    1. Remove Discount Type select
//    2. Remove conditional style on editMaxCapGroup (always visible)
// ─────────────────────────────────────────────────────────────────────────────
{
  let src = read('views/admin/coupons/edit.ejs');

  // 1. Remove Discount Type select
  src = src.replace(
    `          <!-- Discount type + value -->\n          <div class="form-row">\n            <div class="form-group">\n              <label>Discount Type *</label>\n              <select name="discount_type" id="editDiscType" onchange="onTypeChange()">\n                <option value="percentage" <%= coupon.discount_type === 'percentage' ? 'selected' : '' %>>Percentage (%)</option>\n                <option value="fixed"      <%= coupon.discount_type === 'fixed'      ? 'selected' : '' %>>Fixed Amount (₹)</option>\n              </select>\n            </div>\n            <div class="form-group">\n              <label>Discount Value *</label>`,
    `          <!-- Discount value (percentage only) -->\n          <div class="form-row">\n            <div class="form-group">\n              <label>Discount Value (%) *</label>`
  );

  // 2. Remove conditional style on editMaxCapGroup (always visible)
  src = src.replace(
    `            <div class="form-group" id="editMaxCapGroup" style="<%= coupon.discount_type === 'fixed' ? 'display:none;' : '' %>">`,
    `            <div class="form-group" id="editMaxCapGroup">`
  );

  write('views/admin/coupons/edit.ejs', src);
  console.log('✅ views/admin/coupons/edit.ejs');
}

// ─────────────────────────────────────────────────────────────────────────────
// E. views/user/checkout/checkout.ejs
//    1. Simplify coupon discount label (always % OFF)
//    2. Simplify max saving condition
// ─────────────────────────────────────────────────────────────────────────────
{
  let src = read('views/user/checkout/checkout.ejs');

  // 1. Simplify discount display
  src = src.replace(
    `                          <%= c.discount_type === 'percentage' ? c.discount_value + '% OFF' : '₹' + c.discount_value + ' FLAT OFF' %>`,
    `                          <%= c.discount_value %>% OFF`
  );

  // 2. Simplify max saving condition (remove discount_type check)
  src = src.replace(
    `                        <% if (c.max_discount_amount && c.discount_type === 'percentage') { %>`,
    `                        <% if (c.max_discount_amount) { %>`
  );

  write('views/user/checkout/checkout.ejs', src);
  console.log('✅ views/user/checkout/checkout.ejs');
}

// ─────────────────────────────────────────────────────────────────────────────
// F. views/user/coupons/coupons.ejs
//    Remove isPercent variable; always use percentage path
// ─────────────────────────────────────────────────────────────────────────────
{
  let src = read('views/user/coupons/coupons.ejs');

  // Available coupons section (lines ~45-49)
  src = src.replace(
    `            <% availableCoupons.forEach(function (c) {\r\n               const isPercent = c.discount_type === 'percentage';\r\n               const valueLabel = isPercent ? c.discount_value + '%' : '₹' + c.discount_value;\r\n               const typeLabel  = isPercent ? 'Off' : 'Flat Off';\r\n            %>`,
    `            <% availableCoupons.forEach(function (c) {\r\n               const valueLabel = c.discount_value + '%';\r\n               const typeLabel  = 'Off';\r\n            %>`
  );

  // Used coupons section (lines ~114-118)
  src = src.replace(
    `            <% usedCoupons.forEach(function (c) {\r\n               const isPercent = c.discount_type === 'percentage';\r\n               const valueLabel = isPercent ? c.discount_value + '%' : '₹' + c.discount_value;\r\n               const typeLabel  = isPercent ? 'Off' : 'Flat Off';\r\n            %>`,
    `            <% usedCoupons.forEach(function (c) {\r\n               const valueLabel = c.discount_value + '%';\r\n               const typeLabel  = 'Off';\r\n            %>`
  );

  // Also simplify max_discount_amount condition (remove isPercent check)
  src = src.replace(
    `                    <% if (c.max_discount_amount && isPercent) { %>`,
    `                    <% if (c.max_discount_amount) { %>`
  );

  write('views/user/coupons/coupons.ejs', src);
  console.log('✅ views/user/coupons/coupons.ejs');
}

console.log('\n✅ All views patched successfully!\n');
