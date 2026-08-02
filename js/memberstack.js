/* Defensive Positioning Assistant — Memberstack Authentication
 * Login, signup, logout, and auth guard for protected screens.
 * Depends on: ui.js (showScreen defined before this file loads)
 */

var DPA_PLAN_ID = 'pln_pro-ay1e0594';
var DPA_PRICE_ID = 'prc_defensivepositioningpro-monthly-7w2a01mb';
var DPA_PROTECTED = ['homeScreen', 'teamScreen', 'gameScreen'];

/* ── Plan status check ───────────────────────────────────────────────────── */
// Returns true only if the member has an active or trialing connection to the
// pro plan. A logged-in member with no plan, an expired trial, or a canceled
// subscription returns false.
function dpaHasActivePlan(member) {
  if (!member) return false;
  var connections = member.planConnections;
  if (!Array.isArray(connections)) return false;
  return connections.some(function (c) {
    return c.planId === DPA_PLAN_ID && (c.status === 'ACTIVE' || c.status === 'TRIALING');
  });
}

/* ── Dev bypass — localhost only ─────────────────────────────────────────── */
// Two security gates: (1) hostname must be localhost/127.0.0.1 — never true on Netlify.
// (2) a secret token you set once in your browser console:
//       localStorage.setItem('dpa-dev-key', 'your-secret-here')
// Activate for the tab session by visiting: http://localhost:3000/?dev=your-secret-here
// After the first load the URL param is no longer needed for that session.
function dpaDevBypass() {
  try {
    var h = window.location.hostname;
    if (h !== 'localhost' && h !== '127.0.0.1') return false;
    var urlToken = new URLSearchParams(window.location.search).get('dev');
    if (urlToken) sessionStorage.setItem('dpa-dev', urlToken);
    var token = sessionStorage.getItem('dpa-dev');
    var key = localStorage.getItem('dpa-dev-key');
    return !!(key && token && token === key);
  } catch (e) { return false; }
}

/* ── Memberstack modal shim ──────────────────────────────────────────────── */
// Buttons use onclick="DefensivePositioningProAccess.signup/login()" + data-ms-modal attribute.
// The data-ms-modal attribute triggers Memberstack's hosted modal natively once
// the SDK loads. This shim just prevents a ReferenceError if the onclick fires
// before the SDK is ready.
var DefensivePositioningProAccess = {
  signup: function () {
    if (window.$memberstackDom && typeof window.$memberstackDom.openModal === 'function') {
      window.$memberstackDom.openModal('signup');
    }
    // else: data-ms-modal="signup" on the button handles it once SDK loads
  },
  login: function () {
    if (window.$memberstackDom && typeof window.$memberstackDom.openModal === 'function') {
      window.$memberstackDom.openModal('login');
    }
    // else: data-ms-modal="login" on the button handles it once SDK loads
  }
};

/* ── Auth tab toggle ─────────────────────────────────────────────────────── */

function showDpaAuth(type) {
  var signupForm = document.getElementById('dpaSignupForm');
  var loginForm = document.getElementById('dpaLoginForm');
  var signupTab = document.getElementById('dpaSignupTab');
  var loginTab = document.getElementById('dpaLoginTab');
  if (!signupForm || !loginForm) return;

  var isSignup = type === 'signup';
  signupForm.classList.toggle('active', isSignup);
  loginForm.classList.toggle('active', !isSignup);
  if (signupTab) signupTab.classList.toggle('active', isSignup);
  if (loginTab) loginTab.classList.toggle('active', !isSignup);
}

/* ── Logout ──────────────────────────────────────────────────────────────── */

function dpaLogout() {
  if (!window.$memberstackDom) {
    if (typeof showScreen === 'function') showScreen('landingScreen');
    return;
  }
  window.$memberstackDom.logout()
    .then(function () {
      if (typeof showScreen === 'function') showScreen('landingScreen');
    })
    .catch(function () {
      if (typeof showScreen === 'function') showScreen('landingScreen');
    });
}

/* ── showScreen auth guard ───────────────────────────────────────────────── */
// Wraps ui.js showScreen so protected screens require an active Memberstack session.

(function patchShowScreen() {
  var _orig = typeof showScreen === 'function' ? showScreen : null;
  if (!_orig) return;

  window.showScreen = function (id) {
    if (DPA_PROTECTED.indexOf(id) === -1) {
      _orig(id);
      return;
    }

    if (dpaDevBypass()) {
      _orig(id);
      return;
    }

    if (!window.$memberstackDom || typeof window.$memberstackDom.getCurrentMember !== 'function') {
      _orig('landingScreen');
      return;
    }

    window.$memberstackDom.getCurrentMember()
      .then(function (result) {
        var member = result && result.data;
        _orig(dpaHasActivePlan(member) ? id : 'landingScreen');
      })
      .catch(function () {
        _orig('landingScreen');
      });
  };
})();

/* ── Form submit handlers ────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', function () {

  /* Login */
  var loginForm = document.getElementById('dpaLoginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!window.$memberstackDom) return;

      var email = loginForm.querySelector('input[type="email"]').value.trim();
      var password = loginForm.querySelector('input[type="password"]').value;
      var btn = loginForm.querySelector('button[type="submit"]');
      var origText = btn.textContent;

      btn.disabled = true;
      btn.textContent = 'Logging in...';

      window.$memberstackDom.loginMemberEmailPassword({ email: email, password: password })
        .then(function () {
          btn.disabled = false;
          btn.textContent = origText;
          if (typeof showScreen === 'function') showScreen('homeScreen');
        })
        .catch(function (err) {
          btn.disabled = false;
          btn.textContent = origText;
          var msg = (err && err.message) ? err.message : 'Login failed. Please check your credentials.';
          alert(msg);
        });
    });
  }

  /* Signup */
  var signupForm = document.getElementById('dpaSignupForm');
  if (signupForm) {
    signupForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!window.$memberstackDom) return;

      var email = signupForm.querySelector('input[type="email"]').value.trim();
      var password = signupForm.querySelector('input[type="password"]').value;
      var btn = signupForm.querySelector('button[type="submit"]');
      var origText = btn.textContent;

      btn.disabled = true;
      btn.textContent = 'Creating account...';

      window.$memberstackDom.signupMemberEmailPassword({
        email: email,
        password: password,
        plans: [{ planId: DPA_PLAN_ID }]
      })
        .then(function () {
          btn.disabled = false;
          btn.textContent = origText;
          if (typeof showScreen === 'function') showScreen('homeScreen');
        })
        .catch(function (err) {
          btn.disabled = false;
          btn.textContent = origText;
          var msg = (err && err.message) ? err.message : 'Signup failed. Please try again.';
          alert(msg);
        });
    });
  }
});

/* ── Auth state handler ──────────────────────────────────────────────────── */
// Called by onAuthChange and on initial load. Drives three outcomes:
//   1. Member with active plan  → navigate to homeScreen
//   2. Member with no plan      → trigger Stripe checkout via purchasePlansWithCheckout
//   3. No member                → do nothing (landing screen stays)

(function () {
  var _checkoutInFlight = false;

  function handleMemberState(member) {
    if (dpaDevBypass()) {
      var landing = document.getElementById('landingScreen');
      if (landing && landing.classList.contains('active')) {
        if (typeof showScreen === 'function') showScreen('homeScreen');
      }
      return;
    }

    if (!member) return;

    if (dpaHasActivePlan(member)) {
      _checkoutInFlight = false;
      var landing = document.getElementById('landingScreen');
      var home = document.getElementById('homeScreen');
      if (landing && home && landing.classList.contains('active')) {
        if (typeof showScreen === 'function') {
          showScreen('homeScreen');
        } else {
          document.querySelectorAll('.screen').forEach(function (s) {
            s.classList.remove('active');
          });
          home.classList.add('active');
        }
      }
    } else if (!_checkoutInFlight) {
      // Signed in but no active plan — send to Stripe checkout
      var onLanding = document.getElementById('landingScreen');
      if (onLanding && onLanding.classList.contains('active')) {
        _checkoutInFlight = true;
        if (window.$memberstackDom && typeof window.$memberstackDom.purchasePlansWithCheckout === 'function') {
          window.$memberstackDom.purchasePlansWithCheckout({ priceId: DPA_PRICE_ID });
        }
      }
    }
  }

  window.addEventListener('load', function () {
    if (!window.$memberstackDom) return;

    // onAuthChange fires whenever login, signup, or logout occurs
    if (typeof window.$memberstackDom.onAuthChange === 'function') {
      window.$memberstackDom.onAuthChange(function (data) {
        // SDK passes member directly or wrapped — normalise both shapes
        var member = data && (data.data || data.member || (data.id ? data : null));
        handleMemberState(member);
      });
    }

    // Initial check for an existing session on page load
    window.$memberstackDom.getCurrentMember()
      .then(function (result) { handleMemberState(result && result.data); })
      .catch(function () {});
  });
})();
