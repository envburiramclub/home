/*!
 * admin-payments.js - หน้าตรวจสลิป (พื้นที่งาน payments)
 *
 * แยกออกจากหน้าตรวจใบสมัครแล้ว หน้านี้ไม่มีปุ่มอนุมัติใบสมัคร
 * เพราะเป็นงานของเจ้าหน้าที่ทะเบียน ไม่ใช่เจ้าหน้าที่การเงิน
 *
 * งานของหน้านี้จบที่ "ตรวจสลิปผ่าน + ออกใบสำคัญรับเงิน" แล้วส่งต่อให้ทะเบียนอนุมัติ
 */
(function () {
  "use strict";
  var A = window.App;
  var RV = window.AdminReview;

  var tab = "pending";
  var orgTypes = [];

  A.renderHeader("admin", "payments.html", "../");
  A.renderFooter("../");

  A.auth
    .requireAdmin("index.html", "payments")
    .then(function (s) {
      if (!s) return null;
      return Promise.all([A.loadSettings(), A.loadOrgTypes()]);
    })
    .then(function (r) {
      if (!r) return null;
      orgTypes = r[1];
      A.$$("#tabs button").forEach(function (b) {
        b.addEventListener("click", function () {
          A.$$("#tabs button").forEach(function (x) { x.classList.remove("on"); });
          b.classList.add("on");
          tab = b.dataset.tab;
          load();
        });
      });
      return refreshCounts().then(load);
    })
    .catch(function (e) {
      A.$("#loading").hidden = true;
      A.toast(A.errMsg(e), "err");
    });

  function refreshCounts() {
    return A.rpc("admin_stats")
      .then(function (s) {
        A.$("#c-pending").textContent = s.payments_pending || 0;
      })
      .catch(function () {});
  }

  /* ---------- ดึงข้อมูล ---------- */
  function load() {
    A.$("#loading").hidden = false;
    A.$("#list").innerHTML = "";

    var q = A.sb.from("applications").select(RV.SELECT)
      .order("submitted_at", { ascending: true, nullsFirst: false });

    if (tab === "pending") q = q.eq("status", "payment_submitted");
    else if (tab === "verified") q = q.eq("status", "payment_verified");
    else q = q.in("status", ["payment_submitted", "payment_verified", "approved", "rejected"])
              .order("created_at", { ascending: false }).limit(200);

    q.then(function (res) {
      A.$("#loading").hidden = true;
      if (res.error) throw res.error;
      render(res.data || []);
    }).catch(function (e) {
      A.$("#loading").hidden = true;
      A.toast(A.errMsg(e), "err");
    });
  }

  /* ---------- แสดงผล ---------- */
  function render(rows) {
    var host = A.$("#list");
    if (!rows.length) {
      host.innerHTML = '<div class="card"><div class="empty">ไม่มีรายการในหมวดนี้</div></div>';
      return;
    }
    host.innerHTML = rows.map(cardHtml).join("");
    rows.forEach(function (row) {
      RV.loadSlipImage(row, RV.latestPayment(row));
      bindRow(row);
    });
  }

  function cardHtml(row) {
    var m = row.members;
    var pay = RV.latestPayment(row);
    var rec = (row.receipts || [])[0];

    var h = '<div class="card" data-row="' + row.id + '">' + RV.headHtml(row, m);

    h += '<div class="grid">';
    h += '<div class="col-6">' + RV.memberHtml(row, m, orgTypes, rec) + "</div>";
    h += '<div class="col-6">' + RV.slipHtml(row, pay) + "</div>";

    // ที่อยู่ไม่ครบมีผลกับใบสำคัญรับเงินที่หน้านี้เป็นคนออก จึงเตือนที่นี่
    var warn = RV.addressWarnHtml(m);
    if (warn) h += '<div class="col-12">' + warn + "</div>";

    h += "</div>";

    h += '<div class="btn-row mt-2">';
    if (row.status === "payment_submitted" && pay && pay.status === "pending") {
      h += '<button class="btn btn-ok" data-act="verify" data-pay="' + pay.id + '">' +
        "ตรวจสลิปผ่าน + ออกใบสำคัญรับเงิน</button>";
      h += '<button class="btn btn-danger" data-act="reject-pay" data-pay="' + pay.id + '">' +
        "สลิปไม่ผ่าน</button>";
    }
    if (row.status === "payment_verified") {
      h += '<span class="small muted">ตรวจสลิปผ่านแล้ว รอเจ้าหน้าที่ทะเบียนอนุมัติใบสมัคร</span>';
    }
    h += "</div></div>";

    return h;
  }

  /* ---------- ปุ่ม ---------- */
  function bindRow(row) {
    var box = A.$('[data-row="' + row.id + '"]');
    if (!box) return;

    var vb = A.$('[data-act="verify"]', box);
    if (vb) {
      vb.addEventListener("click", function () {
        var pay = RV.latestPayment(row);
        A.modal({
          title: "ยืนยันว่าตรวจสลิปผ่าน",
          bodyHtml:
            "<p>ยืนยันว่าได้ตรวจสอบแล้วว่ามีเงินเข้าบัญชีชมรมจริง จำนวน <strong>" +
            A.fmt.money(pay.amount) + " บาท</strong></p>" +
            '<p class="small muted">ระบบจะออกใบสำคัญรับเงินให้อัตโนมัติ ' +
            "และเปลี่ยนสถานะใบสมัครเป็น ชำระเงินแล้ว รออนุมัติ " +
            "จากนั้นเป็นขั้นตอนของเจ้าหน้าที่ทะเบียน</p>" +
            RV.addressWarnHtml(row.members || {}),
          okText: "ตรวจผ่าน"
        }).then(function (ok) {
          if (!ok) return;
          A.busy(vb, true, "กำลังบันทึก...");
          A.rpc("admin_review_payment", { p_payment_id: pay.id, p_approve: true })
            .then(function (r) {
              A.toast("ออกใบสำคัญรับเงินเลขที่ " + r.receipt_no + " แล้ว", "ok");
              return refreshCounts().then(load);
            })
            .catch(function (e) {
              A.busy(vb, false);
              A.toast(A.errMsg(e), "err", 9000);
            });
        });
      });
    }

    var rb = A.$('[data-act="reject-pay"]', box);
    if (rb) {
      rb.addEventListener("click", function () {
        var pay = RV.latestPayment(row);
        A.modal({
          title: "สลิปไม่ผ่านการตรวจสอบ",
          bodyHtml: '<p class="small muted">ผู้สมัครจะเห็นเหตุผลนี้ และสามารถแนบสลิปใหม่ได้</p>',
          needReason: true,
          reasonLabel: "เหตุผลที่ไม่ผ่าน",
          okText: "บันทึกว่าไม่ผ่าน",
          danger: true
        }).then(function (reason) {
          if (!reason) return;
          A.busy(rb, true, "กำลังบันทึก...");
          A.rpc("admin_review_payment", {
            p_payment_id: pay.id, p_approve: false, p_reason: reason
          })
            .then(function () {
              A.toast("บันทึกว่าสลิปไม่ผ่านแล้ว", "ok");
              return refreshCounts().then(load);
            })
            .catch(function (e) {
              A.busy(rb, false);
              A.toast(A.errMsg(e), "err");
            });
        });
      });
    }
  }
})();
