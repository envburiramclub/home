/*!
 * admin-review.js - ส่วนที่หน้าตรวจใบสมัครและหน้าตรวจสลิปใช้ร่วมกัน
 *
 * ระบบผู้ดูแลแยกสองหน้าออกจากกัน เพราะเป็นงานของคนละสิทธิ์
 *   admin/applications.html  ตรวจใบสมัคร  พื้นที่งาน applications
 *   admin/payments.html      ตรวจสลิป     พื้นที่งาน payments
 *
 * แต่ทั้งสองหน้าต้องแสดง "ข้อมูลผู้สมัคร" ชุดเดียวกัน และดึงรายการชำระเงิน
 * ล่าสุดด้วยตรรกะเดียวกัน ถ้าทำซ้ำสองที่จะเพี้ยนกันเมื่อแก้ข้างเดียว
 * จึงรวมไว้ที่ไฟล์นี้ ส่วนที่ต่างกันจริง (แท็บ ปุ่ม และ RPC) อยู่ในไฟล์ของแต่ละหน้า
 *
 * การกันสิทธิ์จริงอยู่ที่ฐานข้อมูล (RLS + require_area ในทุกฟังก์ชัน)
 * ไฟล์นี้และเมนูเป็นเพียงการไม่พาผู้ใช้ไปเจอทางตัน
 */
(function (global) {
  "use strict";
  var A = global.App;

  /** แถวข้อมูลใน <dl class="dl"> ค่าว่างแสดงเป็นขีด */
  function dt(k, v) {
    if (v === null || v === undefined || v === "") v = "-";
    return "<dt>" + A.esc(k) + "</dt><dd>" + v + "</dd>";
  }

  /*
   * รายการชำระเงินที่ควรสนใจของใบสมัครหนึ่งใบ
   * ให้ความสำคัญกับรายการที่ยังรอตรวจสอบก่อน ถ้าไม่มีจึงเอารายการล่าสุด
   */
  function latestPayment(row) {
    var ps = (row.payments || []).slice().sort(function (a, b) {
      return new Date(b.created_at) - new Date(a.created_at);
    });
    return ps.filter(function (p) { return p.status === "pending"; })[0] || ps[0] || null;
  }

  /** หัวการ์ด: ชื่อผู้สมัคร เลขที่ใบสมัคร ประเภท และป้ายสถานะ */
  function headHtml(row, m) {
    return '<div class="card-head"><div><h3 class="mb-0">' + A.esc(A.fullName(m)) + "</h3>" +
      '<span class="small muted">' +
      A.esc(row.app_no || "-") + " · " +
      (row.app_type === "renew" ? "ต่ออายุ" : "สมัครใหม่") +
      (m.member_code ? " · รหัส " + A.esc(m.member_code) : "") +
      (row.submitted_at ? " · ยื่น " + A.esc(A.fmt.thaiDateTime(row.submitted_at)) : "") +
      "</span></div>" + A.badge(A.APP_STATUS, row.status) + "</div>";
  }

  /** ข้อมูลผู้สมัคร ใช้เหมือนกันทั้งสองหน้า */
  function memberHtml(row, m, orgTypes, rec) {
    return '<dl class="dl">' +
      dt("ตำแหน่ง", m.position_name) +
      dt("หน่วยงาน", A.orgLabel(m, orgTypes)) +
      dt("อำเภอที่ปฏิบัติงาน", m.work_amphoe) +
      dt("เลขที่ใบอนุญาต",
         m.license_no ? m.license_no + (m.license_type ? " (" + m.license_type + ")" : "") : "-") +
      dt("เลขบัตร ปชช. (4 ท้าย)", m.national_id_last4 ? "xxxxxxxxx" + m.national_id_last4 : "-") +
      dt("อีเมล", m.email) +
      dt("ค่าธรรมเนียม", A.fmt.money(row.fee_amount) + " บาท") +
      (rec ? dt("ใบสำคัญรับเงิน", A.esc(rec.receipt_no) + " (" + A.fmt.thaiDate(rec.issued_at) + ")") : "") +
      (row.review_note ? dt("บันทึกการตรวจ", A.esc(row.review_note)) : "") +
      "</dl>";
  }

  /** ผลตรวจสลิปอัตโนมัติแบบย่อ กดเปิดดูได้ */
  function checksHtml(pay) {
    var cr = pay.check_result;
    if (!cr || !cr.checks || !cr.checks.length) return "";
    return '<details class="mt-1"><summary class="small">รายละเอียดผลตรวจอัตโนมัติ</summary>' +
      '<ul class="check-list">' +
      cr.checks.map(function (c) {
        var cls = c.pass === true ? "p" : c.pass === false ? "f" : "n";
        var mk = c.pass === true ? "✓" : c.pass === false ? "✗" : "–";
        return '<li><span class="ck ' + cls + '">' + mk + "</span><span>" +
          A.esc(c.label) + "</span></li>";
      }).join("") +
      "</ul></details>";
  }

  /** บล็อกสลิปพร้อมรูปและผลตรวจ ใช้ที่หน้าตรวจสลิปเท่านั้น */
  function slipHtml(row, pay) {
    if (!pay) {
      return '<div class="alert alert-warn mb-0"><div>' +
        "ยังไม่มีการแนบสลิปสำหรับใบสมัครนี้</div></div>";
    }
    return '<div class="slip-view">' +
      '<div><img class="slip-img" data-slip="' + row.id + '" alt="สลิปการโอนเงิน">' +
      '<a class="btn btn-sm btn-ghost mt-1" data-sliplink="' + row.id +
      '" target="_blank" rel="noopener" hidden>เปิดรูปเต็ม</a></div>' +
      "<div>" + A.badge(A.PAYMENT_STATUS, pay.status) +
      '<dl class="dl mt-1">' +
      dt("จำนวนเงิน", A.fmt.money(pay.amount) + " บาท" +
        (Number(pay.amount) !== Number(row.fee_amount)
          ? ' <span class="badge badge-err">ไม่ตรง</span>' : "")) +
      dt("วันเวลาที่โอน", pay.paid_at ? A.fmt.thaiDateTime(pay.paid_at) : "-") +
      dt("ธนาคาร", pay.bank_name) +
      dt("ผู้โอน", pay.payer_name) +
      dt("เลขอ้างอิง", pay.ref_no) +
      dt("คะแนนตรวจอัตโนมัติ",
         pay.check_score === null || pay.check_score === undefined ? "-" : pay.check_score + "/100") +
      "</dl>" + checksHtml(pay) +
      (pay.slip_qr_raw
        ? '<details class="mt-1"><summary class="small">ข้อมูล QR บนสลิป</summary>' +
          '<div class="tiny mono" style="word-break:break-all">' + A.esc(pay.slip_qr_raw) +
          "</div></details>"
        : "") +
      (pay.reject_reason
        ? '<p class="small" style="color:var(--c-err-700)">เหตุผลที่ไม่ผ่าน: ' +
          A.esc(pay.reject_reason) + "</p>"
        : "") +
      "</div></div>";
  }

  /*
   * รูปถ่ายไม่ใช่ข้อบังคับของการส่งใบสมัคร ผู้สมัครจึงยื่นได้โดยยังไม่มีรูป
   * ผู้ดูแลอนุมัติได้ตามปกติ แต่ต้องรู้ว่าสมาชิกรายนี้จะพิมพ์บัตรยังไม่ได้
   */
  function photoWarnHtml(m) {
    if (m.photo_path) return "";
    return '<div class="alert alert-warn mb-0"><div>' +
      "<strong>ผู้สมัครยังไม่ได้แนบรูปถ่าย</strong>" +
      "อนุมัติใบสมัครได้ตามปกติ แต่จะพิมพ์บัตรสมาชิกยังไม่ได้จนกว่าจะมีรูปถ่าย " +
      "สมาชิกแนบเองได้ที่หน้าข้อมูลสมาชิกหลังใบสมัครได้รับอนุมัติ" +
      "</div></div>";
  }

  /*
   * ที่อยู่ยังไม่ครบ = ใบสำคัญรับเงินจะไม่มีบรรทัดที่อยู่
   * ออกเอกสารให้ได้ แต่ผู้ตรวจสลิปควรรู้ก่อนกดตรวจผ่าน
   */
  function addressWarnHtml(m) {
    var hasWork = !!(m.org_name && m.work_amphoe);
    var hasHome = !!(m.addr_amphoe);
    if (hasWork || hasHome) return "";
    return '<div class="alert alert-warn mb-0"><div>' +
      "<strong>ผู้สมัครยังไม่ได้กรอกที่อยู่</strong>" +
      "ออกใบสำคัญรับเงินให้ได้ แต่เอกสารจะไม่มีบรรทัดที่อยู่ " +
      "หลักฐานอาจไม่สมบูรณ์สำหรับการเบิกจ่าย" +
      "</div></div>";
  }

  /** โหลดรูปสลิปด้วย signed URL ที่มีอายุจำกัด ไม่เปิด bucket เป็นสาธารณะ */
  function loadSlipImage(row, pay) {
    if (!pay || !pay.slip_path) return;
    A.storage.signedUrl(A.cfg.BUCKETS.slips, pay.slip_path, 3600).then(function (u) {
      if (!u) return;
      var img = A.$('[data-slip="' + row.id + '"]');
      if (!img) return;
      if (/\.pdf($|\?)/i.test(pay.slip_path)) {
        img.outerHTML = '<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="' +
          u + '">เปิดไฟล์สลิป (PDF)</a>';
        return;
      }
      img.src = u;
      var link = A.$('[data-sliplink="' + row.id + '"]');
      if (link) { link.href = u; link.hidden = false; }
    }).catch(function () {});
  }

  /*
   * ช่อง select ของ PostgREST ที่ทั้งสองหน้าใช้
   * เขียนเป็นบรรทัดเดียวต่อกัน ห้ามมีตัวขึ้นบรรทัดใหม่อยู่ข้างใน
   * เพราะ PostgREST จะถือว่าเป็นชื่อคอลัมน์และตอบ 400
   */
  var SELECT =
    "id, app_no, app_type, status, fee_amount, term_years, submitted_at, reviewed_at, review_note," +
    "period_start, period_end," +
    "members!inner(id, member_code, title, title_other, first_name, last_name, position_name," +
    "org_name, org_type_code, org_type_other, work_amphoe, addr_amphoe, license_no, license_type," +
    "photo_path, status, valid_from, valid_to, national_id_last4, email)," +
    "payments(id, amount, paid_at, bank_name, payer_name, ref_no, slip_path, slip_sha256," +
    "slip_qr_raw, check_score, check_result, status, reject_reason, created_at)," +
    "receipts(id, receipt_no, amount, amount_text, issued_at)";

  global.AdminReview = {
    dt: dt,
    latestPayment: latestPayment,
    headHtml: headHtml,
    memberHtml: memberHtml,
    checksHtml: checksHtml,
    slipHtml: slipHtml,
    photoWarnHtml: photoWarnHtml,
    addressWarnHtml: addressWarnHtml,
    loadSlipImage: loadSlipImage,
    SELECT: SELECT
  };
})(typeof window !== "undefined" ? window : this);
