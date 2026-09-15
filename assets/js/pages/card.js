/*!
 * card.js - หน้าแสดงตัวอย่างและพิมพ์บัตรสมาชิกเป็น PDF
 */
(function () {
  "use strict";
  var A = window.App;
  var CFG = A.cfg;

  var data = null;

  A.renderHeader("member", "card.html");
  A.renderFooter();

  A.auth
    .requireLogin()
    .then(function (s) {
      if (!s) return null;
      return Promise.all([A.loadSettings(), A.loadOrgTypes(), A.rpc("get_my_status")]);
    })
    .then(function (r) {
      if (!r) return null;
      var orgTypes = r[1];
      var st = r[2];

      if (!st.has_member || !st.card) {
        A.$("#loading").hidden = true;
        A.$("#no-card").hidden = false;
        A.$("#no-card-why").textContent = !st.has_member
          ? "ท่านยังไม่ได้กรอกใบสมัครสมาชิก"
          : st.application && st.application.status !== "approved"
            ? "บัตรสมาชิกจะออกให้เมื่อใบสมัครได้รับอนุมัติแล้ว " +
              "สถานะปัจจุบัน: " + ((A.APP_STATUS[st.application.status] || {}).label || st.application.status)
            : "ไม่พบบัตรสมาชิกที่ใช้งานได้ กรุณาติดต่อเจ้าหน้าที่ทะเบียน";
        return null;
      }

      return buildData(st, orgTypes).then(function (dd) {
        data = dd;
        renderInfo(st);
        renderPreview();
        A.$("#loading").hidden = true;
        A.$("#content").hidden = false;
        wire();
        return null;
      });
    })
    .catch(function (e) {
      A.$("#loading").hidden = true;
      A.toast(A.errMsg(e), "err");
    });

  /* ---------- เตรียมข้อมูลบัตร ---------- */
  function buildData(st, orgTypes) {
    var m = st.member;
    var card = st.card;
    var club = A.setting("club");

    // URL ตรวจสอบบัตรสำหรับ QR หลังบัตร
    var base = location.href.replace(/card\.html.*$/, "");
    var verifyUrl = base + "verify.html?t=" + encodeURIComponent(card.verify_token);

    // QR หลังบัตรเป็นส่วนที่ต้องมี ถ้าสร้างไม่สำเร็จให้แจ้งผู้ใช้ทันที
    // ไม่ปล่อยให้ดาวน์โหลดบัตรที่ไม่มี QR ไปโดยไม่รู้ตัว
    var qrDataUrl = null;
    try {
      qrDataUrl = window.QrUtil.toDataUrl(verifyUrl, 420, 2, "M");
    } catch (e) {
      qrDataUrl = null;
      A.toast(
        "สร้าง QR สำหรับหลังบัตรไม่สำเร็จ (" + A.errMsg(e) + ") " +
        "กรุณาลองโหลดหน้านี้ใหม่ หากยังไม่ได้กรุณาแจ้งเจ้าหน้าที่",
        "err", 12000
      );
    }

    var jobs = [
      m.photo_path
        ? A.storage.dataUrl(CFG.BUCKETS.photos, m.photo_path).catch(function () { return null; })
        : Promise.resolve(null),
      m.signature_path
        ? A.storage.dataUrl(CFG.BUCKETS.signatures, m.signature_path).catch(function () { return null; })
        : Promise.resolve(null)
    ];

    return Promise.all(jobs).then(function (files) {
      return {
        member: m,
        card: card,
        club: club,
        fullName: A.fullName(m),
        position: m.position_name || "",
        org: A.orgLabel(m, orgTypes) || "",
        validToText: A.fmt.thaiDateNum(card.valid_to),
        verifyUrl: verifyUrl,
        photo: files[0],
        signature: files[1],
        qr: qrDataUrl
      };
    });
  }

  /* ---------- ข้อมูลบัตร ---------- */
  function renderInfo(st) {
    var m = st.member, c = st.card;
    A.$("#c-name").textContent = A.fullName(m);
    A.$("#c-badge").innerHTML = c.is_expired
      ? '<span class="badge badge-warn">บัตรหมดอายุแล้ว</span>'
      : A.badge(A.MEMBER_STATUS, m.status);
    A.$("#c-no").textContent = c.card_no;
    A.$("#c-member").textContent = m.member_code || "-";
    A.$("#c-issued").textContent = A.fmt.thaiDate(c.issued_at);
    A.$("#c-valid").textContent =
      A.fmt.thaiDate(c.valid_from) + " ถึง " + A.fmt.thaiDate(c.valid_to);
    A.$("#c-token").textContent = c.verify_token;

    if (c.is_expired) {
      A.$("#btn-card").disabled = false; // ยังพิมพ์เก็บไว้ได้ แต่แจ้งเตือน
    }
  }

  /* ---------- ตัวอย่างบัตร (วาดเป็น canvas ด้วยตรรกะเดียวกับ PDF) ---------- */
  function renderPreview() {
    // ใช้ jsPDF สร้างบัตรจริง แล้วแปลงหน้าเป็นภาพด้วย canvas ของเบราว์เซอร์ไม่ได้
    // จึงวาดตัวอย่างด้วย HTML/CSS ที่ใช้ค่าขนาดเดียวกัน เพื่อให้เห็นภาพใกล้เคียง
    A.$("#prev-front").innerHTML = frontHtml();
    A.$("#prev-back").innerHTML = backHtml();
  }

  function frontHtml() {
    var m = data.member;
    var nameEn = [m.first_name_en, m.last_name_en].filter(Boolean).join(" ");
    return (
      '<div style="position:relative;aspect-ratio:85.6/54;background:#fff;font-family:Sarabun,sans-serif">' +
      '<div style="position:absolute;inset:0 0 auto 0;height:23%;background:linear-gradient(135deg,#0a6152,#12897d);' +
      'display:flex;align-items:center;gap:2%;padding:0 4%">' +
      '<img src="' + LOGO_PREV + '" alt="" ' +
      'style="width:9%;min-width:22px;aspect-ratio:1;object-fit:contain;' +
      'background:#fff;border-radius:50%;padding:1.5%">' +
      '<div style="min-width:0;flex:1">' +
      '<div style="color:#fff;font-weight:700;font-size:clamp(8px,2.6vw,13px);line-height:1.15;' +
      'white-space:nowrap;overflow:hidden;text-overflow:clip">' +
      A.esc(data.club.name || "") + "</div>" +
      '<div style="color:#cfeae4;font-size:clamp(5px,1.5vw,8px);line-height:1.2;white-space:nowrap;overflow:hidden">' +
      A.esc(data.club.name_en || "") + "</div>" +
      "</div></div>" +
      '<div style="position:absolute;top:23%;left:0;right:0;bottom:14%;display:flex;gap:4%;padding:4% 5% 0">' +
      '<div style="flex:0 0 22%;aspect-ratio:19/24.7;border:1px solid #dce6e3;border-radius:2px;' +
      "display:flex;align-items:center;justify-content:center;text-align:center;" +
      "background:" + (data.photo ? 'url(' + data.photo + ') center/cover' : "#d4f1ec") + ';">' +
      // ช่องรูปว่างต้องบอกเหตุ ไม่ปล่อยเป็นสี่เหลี่ยมเปล่าให้เข้าใจผิดว่าบัตรพร้อมแล้ว
      (data.photo
        ? ""
        : '<span style="color:#4b6b63;font-size:clamp(3px,1vw,6px);line-height:1.25;padding:4%">' +
          "ยังไม่มี<br>รูปถ่าย</span>") +
      "</div>" +
      '<div style="flex:1;min-width:0">' +
      '<div style="font-size:clamp(4px,1.2vw,7px);color:#6b7f79">บัตรสมาชิก / MEMBER CARD</div>' +
      '<div style="font-weight:700;color:#14231f;line-height:1.15;font-size:clamp(9px,3vw,15px);' +
      'white-space:nowrap;overflow:hidden">' + A.esc(data.fullName) + "</div>" +
      (nameEn
        ? '<div style="font-size:clamp(5px,1.4vw,8px);color:#3d4f4a;white-space:nowrap;overflow:hidden">' +
          A.esc(nameEn) + "</div>"
        : "") +
      '<div style="font-size:clamp(6px,1.8vw,10px);color:#3d4f4a;margin-top:3%;line-height:1.2">' +
      A.esc(data.position) + "</div>" +
      '<div style="font-size:clamp(6px,1.8vw,10px);color:#064e42;line-height:1.2">' +
      A.esc(data.org) + "</div>" +
      "</div>" +
      (data.signature
        ? '<div style="position:absolute;right:5%;bottom:16%;width:26%;text-align:center">' +
          '<img src="' + data.signature + '" alt="" style="width:100%;max-height:22px;object-fit:contain">' +
          "</div>"
        : "") +
      "</div>" +
      '<div style="position:absolute;left:0;right:0;bottom:0;height:14%;background:#064e42;color:#fff;' +
      'display:flex;align-items:center;justify-content:space-between;padding:0 5%;' +
      'font-size:clamp(5px,1.6vw,9px)">' +
      "<b>รหัสสมาชิก " + A.esc(data.member.member_code || "-") + "</b>" +
      "<span style=\"color:#c7e6df\">มีอายุถึง " + A.esc(data.validToText) + "</span>" +
      "</div></div>"
    );
  }

  function backHtml() {
    var club = data.club;
    var qrImg = data.qr ? '<img src="' + data.qr + '" alt="QR ตรวจสอบสมาชิก" style="width:100%">' : "";
    return (
      '<div style="position:relative;aspect-ratio:85.6/54;background:#fff;font-family:Sarabun,sans-serif">' +
      '<div style="height:12%;background:#064e42;color:#fff;display:flex;align-items:center;' +
      'justify-content:center;font-weight:700;font-size:clamp(5px,1.7vw,9px);padding:0 4%">' +
      A.esc(club.name || "") + "</div>" +
      '<div style="display:flex;gap:4%;padding:4% 5%">' +
      '<div style="flex:1;min-width:0">' +
      '<div style="font-weight:700;color:#064e42;font-size:clamp(4px,1.3vw,7px)">ที่อยู่ชมรม</div>' +
      '<div style="color:#3d4f4a;font-size:clamp(4px,1.25vw,7px);line-height:1.35">' +
      A.esc(club.address || "") + "</div>" +
      '<div style="color:#3d4f4a;font-size:clamp(4px,1.2vw,7px);margin-top:4%">' +
      (club.phone ? "โทร. " + A.esc(club.phone) : "") +
      (club.email ? "  ·  " + A.esc(club.email) : "") + "</div>" +
      '<div style="color:#14231f;font-weight:700;font-size:clamp(4px,1.2vw,7px);margin-top:4%">' +
      "เลขที่บัตร " + A.esc(data.card.card_no) + "</div>" +
      '<div style="color:#6b7f79;font-size:clamp(3px,1vw,6px);word-break:break-all">' +
      "รหัสตรวจสอบ " + A.esc(data.card.verify_token) + "</div>" +
      "</div>" +
      '<div style="flex:0 0 28%;text-align:center">' + qrImg +
      '<div style="color:#6b7f79;font-size:clamp(3px,1vw,6px);margin-top:3%">สแกนเพื่อตรวจสอบสมาชิก</div>' +
      "</div></div>" +
      '<div style="position:absolute;left:0;right:0;bottom:0;background:#f6faf9;border-top:1px solid #dce6e3;' +
      'padding:2.5% 5%;color:#6b7f79;font-size:clamp(3px,1vw,6px);line-height:1.3">' +
      "บัตรนี้เป็นทรัพย์สินของชมรมอนามัยสิ่งแวดล้อมจังหวัดบุรีรัมย์ ใช้ได้เฉพาะผู้มีชื่อบนบัตร " +
      "หากพบบัตรนี้กรุณาส่งคืนตามที่อยู่ข้างต้น</div></div>"
    );
  }

  /* ---------- ดาวน์โหลด PDF ---------- */
  /*
   * รูปถ่ายเป็นข้อบังคับของการออกบัตร ไม่ใช่ของการสมัคร
   * ใบสมัครส่งได้โดยไม่มีรูป และผู้ดูแลอนุมัติออกบัตรในระบบได้
   * แต่ไฟล์บัตรที่พิมพ์ออกไปต้องมีรูปถ่าย ไม่งั้นเป็นบัตรที่ใช้ยืนยันตัวบุคคลไม่ได้
   * จึงกันการสร้าง PDF ไว้ที่นี่ ทั้งปิดปุ่มไว้ล่วงหน้าและกันซ้ำตอนกดปุ่ม
   */
  function hasPhoto() {
    return !!(data && data.photo);
  }

  function wire() {
    var warn = A.$("#photo-warn");
    if (warn) warn.hidden = hasPhoto();

    ["#btn-card", "#btn-a4"].forEach(function (sel) {
      var b = A.$(sel);
      if (!b) return;
      if (!hasPhoto()) {
        b.disabled = true;
        b.title = "ต้องแนบรูปถ่ายก่อนจึงจะพิมพ์บัตรได้";
      }
    });

    A.$("#btn-card").addEventListener("click", function () {
      makePdf("card", this);
    });
    A.$("#btn-a4").addEventListener("click", function () {
      makePdf("a4", this);
    });
  }

  function makePdf(kind, btn) {
    // ไม่มีรูปถ่าย = ออกบัตรไม่ได้ ไม่มีทางเลือก "พิมพ์ต่อไป"
    // ต่างจากกรณี QR ที่ยังพิมพ์ได้เพราะมีรหัสตรวจสอบเป็นข้อความสำรองอยู่
    if (!hasPhoto()) {
      var warn = A.$("#photo-warn");
      if (warn) {
        warn.hidden = false;
        warn.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      A.toast("ยังออกบัตรสมาชิกให้ไม่ได้ เพราะยังไม่ได้แนบรูปถ่าย " +
              "กรุณาแนบรูปถ่ายที่หน้าข้อมูลสมาชิกก่อน", "warn", 9000);
      return;
    }

    // ไม่มี QR = บัตรใช้ตรวจสอบด้วยการสแกนไม่ได้ ต้องถามยืนยันก่อน
    if (!data.qr) {
      A.modal({
        title: "บัตรใบนี้จะไม่มี QR ตรวจสอบ",
        bodyHtml:
          '<div class="alert alert-err mb-2"><div>' +
          "ระบบสร้าง QR สำหรับด้านหลังบัตรไม่สำเร็จ หากพิมพ์ต่อไป " +
          "ด้านหลังบัตรจะมีกรอบแจ้งเตือนแทนตำแหน่ง QR และจะสแกนตรวจสอบสมาชิกไม่ได้" +
          "</div></div>" +
          "<p>แนะนำให้กดโหลดหน้านี้ใหม่ก่อน หากยังไม่ได้กรุณาแจ้งเจ้าหน้าที่ทะเบียน</p>" +
          '<p class="small muted">ผู้ตรวจสอบยังใช้รหัสตรวจสอบที่พิมพ์เป็นข้อความบนบัตร ' +
          "กรอกที่หน้าตรวจสอบบัตรได้</p>",
        okText: "พิมพ์ต่อไปทั้งที่ไม่มี QR",
        cancelText: "ยกเลิก",
        danger: true
      }).then(function (ok) {
        if (ok) build(kind, btn);
      });
      return;
    }
    build(kind, btn);
  }

  function build(kind, btn) {
    A.busy(btn, true, "กำลังสร้าง PDF...");
    setTimeout(function () {
      try {
        var doc = kind === "a4"
          ? window.CardPdf.buildA4Pdf(data)
          : window.CardPdf.buildCardPdf(data);

        var safe = (data.member.member_code || "card").replace(/[^A-Za-z0-9_-]/g, "");
        doc.save("บัตรสมาชิก-" + safe + (kind === "a4" ? "-A4" : "") + ".pdf");

        A.rpc("record_card_print", { p_card_id: data.card.id }).catch(function () {});
        A.rpc("log_client_event", {
          p_action: "print_card",
          p_entity: "cards",
          p_entity_id: data.card.id,
          p_note: "พิมพ์บัตรสมาชิกรูปแบบ " + (kind === "a4" ? "A4" : "ขนาดบัตรจริง")
        }).catch(function () {});

        A.toast("สร้างไฟล์ PDF เรียบร้อย", "ok");
      } catch (e) {
        A.toast("สร้าง PDF ไม่สำเร็จ: " + A.errMsg(e), "err");
      }
      A.busy(btn, false);
    }, 40);
  }

  /* ---------------- ตราชมรมในภาพตัวอย่างบัตร ---------------- */
  /*
   * ตราชมรมแปลงเป็น base64 ฝังไว้ในไฟล์นี้โดยตรง ไม่มีการโหลดไฟล์ภาพ
   * ภาพตัวอย่างบัตรจึงมีตราครบเสมอ ตรงกับไฟล์ PDF ที่ผู้ใช้จะได้รับ
   *
   * ต้นฉบับคือ assets/img/logo.png ย่อเหลือสูง 128 พิกเซล คงสัดส่วนเดิม
   * ช่องตัวอย่างบัตรกว้างไม่เกิน 401 พิกเซล ตราแสดงที่ width:9% คือราว 36 พิกเซล
   * ขนาดนี้จึงคมเต็มที่แม้บนจอความละเอียดสูง โดยไม่ต้องฝังไฟล์ต้นฉบับ 193 KB
   *
   * สร้างค่าใหม่เมื่อเปลี่ยนตราชมรมด้วย tools/make-logo-b64.js ในคลัง docs
   */
  var LOGO_PREV = "data:image/png;base64,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";
})();
