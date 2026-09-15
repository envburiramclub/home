/*!
 * admin-settings.js - หน้าตั้งค่าระบบและจัดการบัญชีผู้ดูแล
 */
(function () {
  "use strict";
  var A = window.App;

  var myRole = null;

  var ROLE_TH = {
    superadmin: "ผู้ดูแลระดับสูงสุด",
    admin: "ผู้ดูแลระบบ",
    registrar: "เจ้าหน้าที่ทะเบียน",
    treasurer: "เจ้าหน้าที่การเงิน",
    registrar_treasurer: "เจ้าหน้าที่ทะเบียนและการเงิน"
  };

  /* สิ่งที่แต่ละบทบาททำได้ แสดงใต้ตารางบัญชีผู้ดูแล ให้ผู้ให้สิทธิ์เห็นผลก่อนกด */
  var ROLE_CAN = {
    superadmin: "ทุกเมนู และเป็นบทบาทเดียวที่เพิ่ม/ยกเลิกสิทธิ์ผู้ดูแลได้",
    admin: "ตรวจใบสมัคร ตรวจสลิป ทะเบียนสมาชิก ประวัติการแก้ไข และตั้งค่าระบบ " +
           "เข้าบัญชีผู้ดูแลระบบและลบสมาชิกไม่ได้",
    registrar: "ตรวจใบสมัคร ทะเบียนสมาชิก ประวัติการแก้ไข",
    treasurer: "ตรวจสลิป ทะเบียนสมาชิก ประวัติการแก้ไข",
    registrar_treasurer: "ตรวจใบสมัคร ตรวจสลิป ทะเบียนสมาชิก ประวัติการแก้ไข"
  };

  A.renderHeader("admin", "settings.html", "../");
  A.renderFooter("../");

  A.auth
    .requireAdmin("index.html", "settings")
    .then(function (s) {
      if (!s) return null;
      return Promise.all([A.loadSettings(true), A.rpc("admin_role")]);
    })
    .then(function (r) {
      if (!r) return null;
      myRole = r[1];
      fill(r[0]);
      A.$("#loading").hidden = true;
      A.$("#content").hidden = false;

      A.$("#btn-save").addEventListener("click", save);
      A.$("#club_address").addEventListener("input", countAddr);
      countAddr();

      /*
       * ผู้ดูแลระบบ (admin) ตั้งค่าได้ครบทั้งห้าหัวข้อ แต่เข้าหัวข้อ 6 ไม่ได้
       * จึงซ่อนทั้งหัวข้อและไม่เรียก loadAdmins() ซึ่งจะถูก RLS ปฏิเสธอยู่แล้ว
       */
      if (myRole !== "superadmin") return null;

      A.$("#sec-admins").hidden = false;
      A.$("#grant-box").hidden = false;
      A.$("#btn-grant").addEventListener("click", grant);
      return loadAdmins();
    })
    .catch(function (e) {
      A.$("#loading").hidden = true;
      A.toast(A.errMsg(e), "err");
    });

  function countAddr() {
    var n = A.$("#club_address").value.length;
    var el = A.$("#addr-count");
    el.textContent = n;
    el.style.color = n > 220 ? "var(--c-err-700)" : n > 180 ? "var(--c-warn-700)" : "";
  }

  function fill(s) {
    var club = s.club || {}, fees = s.fees || {}, mem = s.membership || {};
    var bank = s.bank || {}, legal = s.legal || {}, slip = s.slip_check || {};

    function set(id, v) {
      var e = A.$("#" + id);
      if (e) e.value = v === null || v === undefined ? "" : v;
    }

    set("club_name", club.name);
    set("club_name_en", club.name_en);
    set("club_address", club.address);
    set("club_phone", club.phone);
    set("club_email", club.email);
    set("club_registrar", club.registrar);

    set("fee_new", fees.new);
    set("fee_renew", fees.renew);
    set("term_years", mem.term_years);
    set("renew_window", mem.renew_window_days);

    set("bank_name", bank.bank_name);
    set("bank_acc", bank.account_no);
    set("bank_accname", bank.account_name);
    set("pp_type", bank.promptpay_type || "phone");
    set("pp_id", bank.promptpay_id);
    set("bank_note", bank.note);

    set("slip_age", slip.max_age_days);
    set("slip_score", slip.min_score_auto_flag);

    set("legal_privacy", legal.privacy_version);
    set("legal_terms", legal.terms_version);
    set("legal_dpo", legal.dpo_email);
    set("legal_retention", legal.retention_years);
  }

  function save() {
    var btn = A.$("#btn-save");

    var ppId = A.$("#pp_id").value.replace(/\D/g, "");
    var ppType = A.$("#pp_type").value;
    if (ppId) {
      if (ppType === "phone" && ppId.length !== 10) {
        A.toast("รหัสพร้อมเพย์แบบเบอร์โทรต้องเป็นเลข 10 หลัก", "warn");
        return;
      }
      if (ppType === "nid" && ppId.length !== 13) {
        A.toast("รหัสพร้อมเพย์แบบเลขประจำตัวประชาชนต้องเป็นเลข 13 หลัก", "warn");
        return;
      }
    }

    var payload = [
      {
        key: "club",
        value: {
          name: A.$("#club_name").value.trim(),
          name_en: A.$("#club_name_en").value.trim(),
          short_name: A.$("#club_name").value.trim(),
          address: A.$("#club_address").value.trim().replace(/\s+/g, " "),
          phone: A.$("#club_phone").value.trim(),
          email: A.$("#club_email").value.trim(),
          registrar: A.$("#club_registrar").value.trim()
        }
      },
      {
        key: "fees",
        value: {
          new: Number(A.$("#fee_new").value || 0),
          renew: Number(A.$("#fee_renew").value || 0)
        }
      },
      {
        key: "membership",
        value: {
          term_years: Math.max(1, Number(A.$("#term_years").value || 1)),
          renew_window_days: Math.max(0, Number(A.$("#renew_window").value || 90))
        }
      },
      {
        key: "bank",
        value: {
          bank_name: A.$("#bank_name").value.trim(),
          account_no: A.$("#bank_acc").value.trim(),
          account_name: A.$("#bank_accname").value.trim(),
          promptpay_type: ppType,
          promptpay_id: ppId,
          note: A.$("#bank_note").value.trim()
        }
      },
      {
        key: "slip_check",
        value: {
          max_age_days: Math.max(1, Number(A.$("#slip_age").value || 30)),
          min_score_auto_flag: Math.min(100, Math.max(0, Number(A.$("#slip_score").value || 60))),
          require_qr: false,
          allow_amount_tolerance: 0
        }
      },
      {
        key: "legal",
        value: {
          privacy_version: A.$("#legal_privacy").value.trim() || "1.0",
          terms_version: A.$("#legal_terms").value.trim() || "1.0",
          dpo_email: A.$("#legal_dpo").value.trim(),
          retention_years: Math.max(1, Number(A.$("#legal_retention").value || 5))
        }
      }
    ];

    A.busy(btn, true, "กำลังบันทึก...");
    A.auth
      .user()
      .then(function (u) {
        var rows = payload.map(function (p) {
          return {
            key: p.key,
            value: p.value,
            is_public: true,
            updated_at: new Date().toISOString(),
            updated_by: u ? u.id : null
          };
        });
        return A.sb.from("settings").upsert(rows, { onConflict: "key" });
      })
      .then(function (res) {
        // การแก้ไขตาราง settings ถูกบันทึกลง audit_log ด้วยทริกเกอร์ฝั่งฐานข้อมูล
        if (res.error) throw res.error;
      })
      .then(function () {
        A.busy(btn, false);
        A.toast("บันทึกการตั้งค่าเรียบร้อย", "ok");
        return A.loadSettings(true).then(function (s) {
          fill(s);
          countAddr();
        });
      })
      .catch(function (e) {
        A.busy(btn, false);
        A.toast(A.errMsg(e), "err", 9000);
      });
  }

  /* ---------- บัญชีผู้ดูแล ---------- */
  function loadAdmins() {
    return A.sb
      .from("admins")
      .select("user_id, role, full_name, position, active, created_at")
      .order("created_at")
      .then(function (res) {
        if (res.error) throw res.error;
        var rows = res.data || [];
        var host = A.$("#admins-box");
        if (!rows.length) {
          host.innerHTML = '<p class="muted small mb-0">ยังไม่มีบัญชีผู้ดูแลในระบบ</p>';
          return;
        }
        host.innerHTML =
          '<div class="table-wrap"><table class="data"><thead><tr>' +
          "<th>ชื่อ-นามสกุล</th><th>ตำแหน่ง</th><th>บทบาท</th><th>สถานะ</th><th></th>" +
          "</tr></thead><tbody>" +
          rows.map(function (a) {
            return "<tr><td>" + A.esc(a.full_name || "-") + "</td>" +
              "<td>" + A.esc(a.position || "-") + "</td>" +
              "<td>" + A.esc(ROLE_TH[a.role] || a.role) +
              '<div class="tiny muted">' + A.esc(ROLE_CAN[a.role] || "") + "</div></td>" +
              "<td>" + (a.active
                ? '<span class="badge badge-ok">ใช้งาน</span>'
                : '<span class="badge">ปิดใช้งาน</span>') + "</td>" +
              '<td class="nowrap">' +
              (myRole === "superadmin" && a.active
                ? '<button class="btn btn-sm btn-danger" data-revoke="' +
                  A.esc(a.user_id) + '">ยกเลิกสิทธิ์</button>'
                : "") +
              "</td></tr>";
          }).join("") +
          "</tbody></table></div>";

        A.$$("[data-revoke]", host).forEach(function (b) {
          b.addEventListener("click", function () {
            var uid = b.dataset.revoke;
            A.confirm("ยกเลิกสิทธิ์ผู้ดูแล",
              "บัญชีนี้จะไม่สามารถเข้าหน้าผู้ดูแลได้อีก แต่ยังใช้งานระบบสมาชิกได้ปกติ",
              { danger: true, okText: "ยกเลิกสิทธิ์" })
              .then(function (ok) {
                if (!ok) return;
                A.busy(b, true, "กำลังยกเลิก...");
                A.rpc("admin_revoke_admin", { p_user_id: uid })
                  .then(function () {
                    A.toast("ยกเลิกสิทธิ์แล้ว", "ok");
                    return loadAdmins();
                  })
                  .catch(function (e) {
                    A.busy(b, false);
                    A.toast(A.errMsg(e), "err");
                  });
              });
          });
        });
      })
      .catch(function (e) {
        A.$("#admins-box").innerHTML =
          '<div class="alert alert-err mb-0"><div>' + A.esc(A.errMsg(e)) + "</div></div>";
      });
  }

  function grant() {
    var btn = A.$("#btn-grant");
    var email = A.$("#g-email").value.trim().toLowerCase();
    if (!email) { A.toast("กรุณากรอกอีเมลผู้ใช้", "warn"); return; }

    A.busy(btn, true, "กำลังเพิ่มสิทธิ์...");
    A.rpc("admin_grant_admin", {
      p_email: email,
      p_role: A.$("#g-role").value,
      p_full_name: A.$("#g-name").value.trim(),
      p_position: A.$("#g-pos").value.trim()
    })
      .then(function () {
        A.busy(btn, false);
        A.toast("เพิ่มสิทธิ์ผู้ดูแลให้ " + email + " แล้ว", "ok");
        A.$("#g-email").value = "";
        A.$("#g-name").value = "";
        A.$("#g-pos").value = "";
        return loadAdmins();
      })
      .catch(function (e) {
        A.busy(btn, false);
        A.toast(A.errMsg(e), "err", 9000);
      });
  }
})();
