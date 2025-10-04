PAYFAST DETAILS 
Merchant ID: 31497961
Merchant Key: j7zjpqxlrqqeo
Security Passphrase -Novapropsignature1
Notify URL - https://nova-prop-backend.onrender.com/payfast/itn



Custom Payment Integration 
Build a checkout form and receive payments securely from our payment platform . This process can be used for both one time and recurring payments 

Live: https://www.payfast.co.za/eng/process
Sandbox: https://sandbox.payfast.co.za/eng/process

Simple Form Integration : 
Merchant id 
Merchant Key 
Amount 
Item name 
“<form action="https://www.payfast.co.za/eng/process" method="post">
   <input type="hidden" name="merchant_id" value="10000100">
   <input type="hidden" name="merchant_key" value="46f0cd694581a">
   <input type="hidden" name="amount" value="100.00">
   <input type="hidden" name="item_name" value="Test Product">
   <input type="submit">
</form>”

Step 1 : Create your checkout form 
Create a checkout page with a HTML form , usually hidden with a number of fields containing all the necessary information needed for Payfast to process the payment . 
Most shopping cart platforms will have the customer click on a ‘ Confirm Order ‘ or “Pay now” button to submit the form and be redirected to the Payfast Payment page 
MERCHANT ID – Integer 8 characters
Merchant ID , as given by the Payfast system , Used to uniquely identify the receiving account . This can be found on the merchant settings page 

Merchant_key – string required 
The merchant as a given by the payfast system . Used to identify the receiving account . This provides an extra level of certainty concerning the correct account as both the ID and the key must correct in order for the transaction to proceed . This can be found on the merchant settings page 

Return url , string nor char limit opitional
notify_urlstring, no char limitOPTIONAL
The URL which is used by Payfast to post the Instant Transaction Notifications (ITNs) for this transaction.

fica_idnumberinteger, 13 charOPTIONAL
The Fica ID Number provided of the buyer must be a valid South African ID Number.
<input type="hidden" name="merchant_id" value="10000100">
<input type="hidden" name="merchant_key" value="46f0cd694581a">
<input type="hidden" name="return_url" value="https://www.example.com/success">
<input type="hidden" name="cancel_url" value="https://www.example.com/cancel">
<input type="hidden" name="notify_url" value="https://www.example.com/notify">
 Customer details
name_firststring, 100 char OPTIONAL
The customer’s first name.
name_laststring, 100 char OPTIONAL
The customer’s last name.
email_addressstring, 100 char OPTIONAL
The customer’s email address.
cell_numberstring, 100 char OPTIONAL
The customer’s valid cell number. If the email_address field is empty, and cell_number provided, the system will use the cell_number as the username and auto login the user, if they do not have a registered account
<input type="hidden" name="name_first" value="John">
<input type="hidden" name="name_last" value="Doe">
<input type="hidden" name="email_address" value="john@doe.com">
<input type="hidden" name="cell_number" value="0823456789">
Transaction details
m_payment_idstring, 100 char OPTIONAL
Unique payment ID on the merchant’s system.
amountdecimalREQUIRED
The amount which the payer must pay in ZAR.
item_namestring, 100 char REQUIRED
The name of the item being charged for, or in the case of multiple items the order number.
item_descriptionstring, 255 char OPTIONAL
The description of the item being charged for, or in the case of multiple items the order description.
custom_int<1..5>integer, 255 charOPTIONAL
A series of 5 custom integer variables (custom_int1, custom_int2…) which can be used by the merchant as pass-through variables. They will be posted back to the merchant at the completion of the transaction.
custom_str<1..5>string, 255 char OPTIONAL
A series of 5 custom string variables (custom_str1, custom_str2…) which can be used by the merchant as pass-through variables. They will be posted back to the merchant at the completion of the transaction.

Transaction Options 
-	Email confirmation , which is a Boolean , 1 char optional 
-	Whether to send an email confirmation to the merchant of the transaction . The email confirmation is automatically send to the payer 1 = on and 0 = off 
-	<input type="hidden" name="email_confirmation" value="1">
-	<input type="hidden" name="confirmation_address" value="john@doe.com">
Confirmation_Address – string , 100 char optional 
-	The email address to send the confirmation email to . This value can be set globally on your account . Using this field will override the value set in your account for this transaction .
Payment Methods 
-	When this field is set , only the single payment method specified can be used when the customer reaches Payfast . If this field is blank or not included then all available payment methods will be shown 
-	The values are as follows 
-	ef’ – EFT
-	‘cc’ – Credit card
-	‘dc’ – Debit card
-	’mp’ – Masterpass Scan to Pay
-	‘mc’ – Mobicred
-	‘sc’ – SCode
-	‘ss’ – SnapScan
-	‘zp’ – Zapper
-	‘mt’ – MoreTyme
-	‘rc’ – Store card
-	‘mu’ – Mukuru
-	‘ap’ – Apple Pay
-	‘sp’ – Samsung Pay
-	‘cp’ – Capitec Pay

Recurring Billing and Split Payment Form Options 

Subscriptions 
-	A recurring charge on a given date . Payfast will charge the credit card according to the frequency , billing date and number of payments ( cycles ) specified in the payment request 
-	Passphrase: Please note that for Subscriptions a passphrase is REQUIRED in your signature.
To get a passphrase while testing in the sandbox, visit https://sandbox.payfast.co.za, under SETTINGS edit the "Salt Passphrase". You can now use the new passphrase and merchant credentials for your sandbox testing.

-	The subscription variables 
-	<input type="hidden" name="subscription_type" value="1">
-	<input type="hidden" name="billing_date" value="2020-01-01">
-	<input type="hidden" name="recurring_amount" value="123.45">
-	<input type="hidden" name="frequency" value="3">
-	<input type="hidden" name="cycles" value="12">
-	<input type="hidden" name="subscription_notify_email" value="true">
-	<input type="hidden" name="subscription_notify_webhook" value="true">
-	<input type="hidden" name="subscription_notify_buyer" value="true">
-	Additional subscription form fields
-	subscription_typeinteger, 1 charREQUIRED FOR SUBSCRIPTIONS
-	1 – sets type to a subscription
-	billing_datedate (YYYY-MM-DD)OPTIONAL
-	The date from which future subscription payments will be made. Eg. 2020-01-01. Defaults to current date if not set.
-	recurring_amountdecimalOPTIONAL
-	Future recurring amount for the subscription in ZAR. Defaults to the ‘amount’ value if not set. There is a minimum value of 5.00.
It is possible to set up a subscription or tokenization payment with an initial amount of R0.00. This would be used with subscriptions if the first cycle/period is free, or, in the case of tokenization payments it is used to set up the customers account on the merchants site, allowing for future payments. If the initial amount is R0.00 the customer will be redirected to Payfast, where they will input their credit card details and go through 3D Secure, but no money will be deducted.
-	frequencyinteger, 1 charREQUIRED FOR SUBSCRIPTIONS
-	The cycle period.
   1 - Daily
   2 - Weekly
   3 - Monthly
   4 - Quarterly
   5 - Biannually
   6 - Annual
-	cyclesinteger, 1 charREQUIRED FOR SUBSCRIPTIONS
-	The number of payments/cycles that will occur for this subscription. Set to 0 for indefinite subscription.
-	subscription_notify_emailbooleanOPTIONAL
-	Send the merchant an email notification 7 days before a subscription trial ends, or before a subscription amount increases.
This setting is enabled by default and can be changed via the merchant dashboard: Settings -> Recurring Billing.
-	subscription_notify_webhookbooleanOPTIONAL
-	Send the merchant a webhook notification 7 days before a subscription trial ends, or before a subscription amount increases.
The webhook notification URL can be set via the merchant dashboard: Settings -> Recurring Billing.
-	subscription_notify_buyerbooleanOPTIONAL
-	Send the buyer an email notification 7 days before a subscription trial ends, or before a subscription amount increases.
This setting is enabled by default and can be changed via the merchant dashboard: Settings -> Recurring Billing.
-	
-	"type":"subscription.free-trial",
-	"token":"dc0521d3-55fe-269b-fa00-b647310d760f",
-	"initial_amount":0,
-	"amount":10000,
-	"next_run":"2021-03-30",
-	"frequency":"3",
-	"item_name":"Test Item",
-	"item_description":"A test product",
-	"name_first":"John",
-	"name_last":"Doe",
-	"email_address":"john@example.com"
-	}
-	Webhook attributes
-	typestringREQUIRED
-	The type of webhook being sent, can be one of 'subscription.free-trial', 'subscription.promo' or 'subscription.update'.
-	tokenstringREQUIRED
-	The Unique ID on Payfast that represents the subscription.
-	initial_amountintegerREQUIRED
-	The initial amount payable during the free trial or promotion period, in cents (ZAR).
-	amountintegerREQUIRED
-	The subscription amount, in cents (ZAR).
-	next_runYYYY-MM-DDOPTIONAL
-	The next run date for the subscription.
-	frequencyinteger, 1 charOPTIONAL
-	The cycle period.
   1 - Daily
   2 - Weekly
   3 - Monthly
   4 - Quarterly
   5 - Biannually
   6 - Annual
-	item_namestring, 100 char OPTIONAL
-	The name of the item being charged for, or in the case of multiple items the order number.
-	item_descriptionstring, 255 char OPTIONAL
-	The description of the item being charged for, or in the case of multiple items the order description.
-	name_firststring, 100 char OPTIONAL
-	The customer’s first name.
-	name_laststring, 100 char OPTIONAL
-	The customer’s last name.
-	email_addressstring, 100 char OPTIONAL
-	The customer’s email address.

STEP 2 : Create security signature
A generated MD5 signature must be passed as an additional hidden input and this hash is then used to ensure the integrity of the data transfer 
<input type="hidden" name="signature" value="f103e22c0418655fb03991538c51bfd5">

To generate the signature 
const crypto = require("crypto");

const generateSignature = (data, passPhrase = null) => {
  // Create parameter string
  let pfOutput = "";
  for (let key in data) {
    if(data.hasOwnProperty(key)){
      if (data[key] !== "") {
        pfOutput +=`${key}=${encodeURIComponent(data[key].trim()).replace(/%20/g, "+")}&`
      }
    }
  }

  // Remove last ampersand
  let getString = pfOutput.slice(0, -1);
  if (passPhrase !== null) {
    getString +=`&passphrase=${encodeURIComponent(passPhrase.trim()).replace(/%20/g, "+")}`;
  }

  return crypto.createHash("md5").update(getString).digest("hex");
};

1.	Concetenation of the name value pairs of all the non blank variables with & used as a separator 
2.	Variable order: The pairs must be listed in the order in which they appear in the attributes description. eg. name_first=John&name_last=Doe&email_address=…
* Do not use the API signature format, which uses alphabetical ordering!
3.	The passphrase is an extra security feature, used as a ‘salt’, and is set by the Merchant in the Settings section of their Payfast Dashboard.
Add the passphrase to the end of the below string.
E.g. name_first=John&name_last=Doe&email_address=…&passphrase=...
4.	The resultant URL encoding must be in upper case (eg. http%3A%2F%2F), and spaces encoded as ‘+’.
5.	3. MD5 the parameter string and pass it as a hidden input named “signature”
6.	Troubleshooting: For troubleshooting signature mismatch issues check out our knowledge base Common causes of a failed integration / signature mismatch

STEP 3 : Send the customer to payfast for payment 
On submission of your form , your customer will be redirected to the secure payment page , your form should be setup to post to either payfast live url or the sandbox for testing 
const myData = [];
// Merchant details
myData["merchant_id"] = "10000100";
myData["merchant_key"] = "46f0cd694581a";
myData["return_url"] = "http://www.yourdomain.co.za/return_url";
myData["cancel_url"] = "http://www.yourdomain.co.za/cancel_url";
myData["notify_url"] = "http://www.yourdomain.co.za/notify_url";
// Buyer details
myData["name_first"] = "First Name";
myData["name_last"] = "Last Name";
myData["email_address"] = "test@test.com";
// Transaction details
myData["m_payment_id"] = "1234";
myData["amount"] = "10.00";
myData["item_name"] = "Order#123";

// Generate signature
const myPassphrase = "jt7NOE43FZPn";
myData["signature"] = generateSignature(myData, myPassphrase);

let htmlForm = `<form action="https://${pfHost}/eng/process" method="post">`;
for (let key in myData) {
  if(myData.hasOwnProperty(key)){
    value = myData[key];
    if (value !== "") {
      htmlForm +=`<input name="${key}" type="hidden" value="${value.trim()}" />`;
    }
  }
}

htmlForm += '<input type="submit" value="Pay Now" /></form>';

Step 4 :
Confirm payment is successful 
Before the customer is returned to the URL , you specified in the return url parameter , Payfast will send a notification to your “notify_url” page.
4.1. Setting up your notification page:


On receiving the payment notification from Payfast, return a header 200 to prevent further retries.
If no 200 response is returned the notification will be re-sent immediately, then after 10 minutes and then at exponentially longer intervals until eventually stopping.
Example of a Transaction Webhook Payload

const ITN_Payload = {
 'm_payment_id': 'SuperUnique1',
 'pf_payment_id': '1089250',
 'payment_status': 'COMPLETE',
 'item_name': 'test+product',
 'item_description': 'test+description' ,
 'amount_gross': 200.00,
 'amount_fee': -4.60,
 'amount_net': 195.40,
 'custom_str1': '',
 'custom_str2': '',
 'custom_str3': '',
 'custom_str4': '',
 'custom_str5': '',
 'custom_int1': '',
 'custom_int2': '',
 'custom_int3': '',
 'custom_int4': '',
 'custom_int5': '',
 'name_first': '',
 'name_last': '',
 'email_address': '',
 'merchant_id': '10000100',
 'signature': 'ad8e7685c9522c24365d7ccea8cb3db7'
};
4.2. Receive the notification parameters


As part of the notification you can expect to receive the following parameters:
Transaction details
m_payment_idstring, 100 charOPTIONAL
Unique payment ID on the merchant’s system.
pf_payment_idintegerREQUIRED
Unique transaction ID on Payfast.
payment_statusstring (CANCELLED / COMPLETE)REQUIRED
After a successful payment the status sent will be COMPLETE. When a subscription is cancelled the status will be CANCELLED.
item_namestring, 100 charREQUIRED
The name of the item being charged for, or in the case of multiple items the order number.
item_descriptionstring, 255 charOPTIONAL
The description of the item being charged for, or in the case of multiple items the order description.
amount_grossdecimalOPTIONAL
The total amount the customer paid in ZAR.
amount_feedecimalOPTIONAL
The total in fees which was deducted from the amount in ZAR.
amount_netdecimalOPTIONAL
The net amount credited to the merchant’s account in ZAR.
custom_int<1..5>integer, 255 charOPTIONAL
The series of 5 custom integer variables (custom_int1, custom_int2…) originally passed by the receiver during the payment request.
custom_str<1..5>string, 255 charOPTIONAL
The series of 5 custom string variables (custom_str1, custom_str2…) originally passed by the receiver during the payment request.
Customer details
name_firststring, 100 charOPTIONAL
The customer’s first name.
name_laststring, 100 charOPTIONAL
The customer’s last name.
email_addressstring, 100 charOPTIONAL
The customer’s email address.
Merchant details
merchant_idinteger, 8 charREQUIRED
The Merchant ID as given by the Payfast system. Used to uniquely identify the receiver’s account.
Recurring Billing details
tokenstring, 36 charREQUIRED
Unique ID on Payfast that represents the subscription.
billing_datedate, YYYY-MM-DDOPTIONAL
The date from which future subscription payments will be made. Eg. 2020-01-01. Defaults to current date if not set.
Security information
signatureMD5 hash in lower caseOPTIONAL
A security signature of the transmitted data taking the form of an MD5 hash of all the url encoded submitted variables.
Example of a Transaction Webhook Payload
Node.js
const ITN_Payload = {
 'm_payment_id': 'SuperUnique1',
 'pf_payment_id': '1089250',
 'payment_status': 'COMPLETE',
 'item_name': 'test+product',
 'item_description': 'test+description' ,
 'amount_gross': 200.00,
 'amount_fee': -4.60,
 'amount_net': 195.40,
 'custom_str1': '',
 'custom_str2': '',
 'custom_str3': '',
 'custom_str4': '',
 'custom_str5': '',
 'custom_int1': '',
 'custom_int2': '',
 'custom_int3': '',
 'custom_int4': '',
 'custom_int5': '',
 'name_first': '',
 'name_last': '',
 'email_address': '',
 'merchant_id': '10000100',
 'signature': 'ad8e7685c9522c24365d7ccea8cb3db7'
}; 
4.3. Conduct security checks


Conduct four security checks to ensure that the data you are receiving is correct, from the correct source and hasn’t been altered; you should not continue the process if a test fails!
Notification page
Node.js
const axios = require("axios");
const crypto = require("crypto");
const dns = require('dns');

const testingMode = true;
const pfHost = testingMode ? "sandbox.payfast.co.za" : "www.payfast.co.za";

const pfData = JSON.parse(JSON.stringify(req.body));

let pfParamString = "";
for (let key in pfData) {
  if(pfData.hasOwnProperty(key) && key !== "signature"){
    pfParamString +=`${key}=${encodeURIComponent(pfData[key].trim()).replace(/%20/g, "+")}&`;
  }
}

// Remove last ampersand
pfParamString = pfParamString.slice(0, -1);
 
•	Verify the signature


Verify the security signature in the notification; this is done in a similar way that the signature that you generated for stage one of the user payment flow.
The string that gets created needs to include all fields posted from Payfast.
Verify Signature
Node.js
const pfValidSignature = (pfData, pfParamString, pfPassphrase = null ) => {
  // Calculate security signature
  let tempParamString = '';
  if (pfPassphrase !== null) {
    pfParamString +=`&passphrase=${encodeURIComponent(pfPassphrase.trim()).replace(/%20/g, "+")}`;
  }

  const signature = crypto.createHash("md5").update(pfParamString).digest("hex");
  return pfData['signature'] === signature;
}; 
•	Check that the notification has come from a valid Payfast domain


The following is a list of valid domains:
- www.payfast.co.za
- w1w.payfast.co.za
- w2w.payfast.co.za
- sandbox.payfast.co.za
Check valid Payfast domain
Node.js
async function ipLookup(domain){
  return new Promise((resolve, reject) => {
    dns.lookup(domain, {all: true}, (err, address, family) => {
      if(err) {
        reject(err)
      } else {
        const addressIps = address.map(function (item) {
         return item.address;
        });
        resolve(addressIps);
      }
    });
  });
}

const pfValidIP = async (req) => {
  const validHosts = [
    'www.payfast.co.za',
    'sandbox.payfast.co.za',
    'w1w.payfast.co.za',
    'w2w.payfast.co.za'
  ];

  let validIps = [];
  const pfIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  try{
    for(let key in validHosts) {
      const ips = await ipLookup(validHosts[key]);
      validIps = [...validIps, ...ips];
    }
  } catch(err) {
    console.error(err);
  }

  const uniqueIps = [...new Set(validIps)];

  if (uniqueIps.includes(pfIp)) {
    return true;
  }
  return false;
}; 
•	Compare payment data


The amount you expected the customer to pay should match the “amount_gross” value sent in the notification.
Compare payment data
Node.js
const pfValidPaymentData = ( cartTotal, pfData ) => {
    return Math.abs(parseFloat(cartTotal) - parseFloat(pfData['amount_gross'])) <= 0.01;
}; 
•	Perform a server request to confirm the details


Validate the data that you have received from Payfast by contacting our server and confirming the order details.
Live: https://www.payfast.co.za/eng/query/validate
Sandbox: https://sandbox.payfast.co.za/eng/query/validate
 
Curl Options
CURLOPT_RETURNTRANSFER	Set to TRUE to return the transfer as a string of the return value of curl_exec() instead of outputting it out directly.
CURLOPT_HEADER	Set to FALSE to exclude the header in the output.
CURLOPT_SSL_VERIFYHOST	Set to 2 to check the existence of a common name in the SSL peer certificate, and to also verify that it matches the hostname provided.
CURLOPT_SSL_VERIFYPEER	This option determines whether curl verifies the authenticity of the peer’s certificate. The default value is 1.
CURLOPT_URL	Set to the Payfast query validation URL, eg. https://www.payfast.co.za/eng/query/validate. This can also be set when initializing a session with curl_init().
CURLOPT_POST	Set to TRUE to do a regular HTTP POST. This POST is the normal application/x-www-form-urlencoded kind, most commonly used by HTML forms.
CURLOPT_POSTFIELDS	The full data to post via HTTP to Payfast. This parameter is passed as a urlencoded string, such as: m_payment_id=01&pf_payment_id=01234..
Server request to confirm details
Node.js
const pfValidServerConfirmation = async (pfHost, pfParamString) => {
    const result = await axios.post(`https://${pfHost}/eng/query/validate`, pfParamString)
        .then((res) => {
            return res.data;
        })
        .catch((error) => {
            console.error(error)
        });
   return result === 'VALID';
}; 
Bringing the checks together
Node.js
const check1 = pfValidSignature(pfData, pfParamString, passPhrase);
const check2 = pfValidIP(req);
const check3 = pfValidPaymentData( cartTotal, pfData );
const check4 = pfValidServerConfirmation(pfHost, pfParamString);

if(check1 && check2 && check3 && check4) {
    // All checks have passed, the payment is successful
} else {
    // Some checks have failed, check payment manually and log for investigation
} 
Onsite Payments with Payfast
Onsite Payments (Beta)
Integrate Payfast’s secure payment engine directly into the checkout page.
Important: Please note that for security reasons Onsite Payments requires that your application be served over HTTPS.

Step 1: Post payment details and get a unique payment identifier
The transaction and customer details need to be sent to Payfast before any customer interaction.
Live: https://www.payfast.co.za/onsite/process
Sandbox: https://sandbox.payfast.co.za/onsite/process

POST /onsite/process
https://www.payfast.co.za/onsite/process 
RESPONSE
{
"uuid":"123-abc"
}
The following are additional requirements for Onsite
signaturestringREQUIRED
The signature is a hash of the posted data used to ensure the integrity of the data transfer
email_addressstring, 100 char REQUIRED UNLESS MOBILE REGISTRATION ALLOWED
The customer’s email address. This is required unless the merchant has specifically allowed mobile registration from their account.
cell_numberstring, 100 char REQUIRED IF EMAIL NOT SET
The customer’s valid cell number. If the email_address field is empty, and cell_number provided, the system will use the cell_number as the username and auto login the user, if they do not have a registered account
If no return_url is submitted, the modal will just close on payment completion and customers will not be redirected to a success page.
const axios = require("axios");

const myData = {
  "merchant_id": "10000100",
  "merchant_key": "46f0cd694581a",
  ...
};
const passPhrase = 'jt7NOE43FZPn';

const dataToString = (dataArray) => {
  // Convert your data array to a string
  let pfParamString = "";
  for (let key in dataArray) {
    if(dataArray.hasOwnProperty(key)){pfParamString +=`${key}=${encodeURIComponent(dataArray[key].trim()).replace(/%20/g, "+")}&`;}
  }
  // Remove last ampersand
  return pfParamString.slice(0, -1);
};

const generatePaymentIdentifier = async (pfParamString) => {
  const result = await axios.post(`https://www.payfast.co.za/onsite/process`, pfParamString)
      .then((res) => {
        return res.data.uuid || null;
      })
      .catch((error) => {
        console.error(error)
      });
  console.log("res.data", result);
  return result;
};

// Generate signature (see Custom Integration -> Step 2)
myData["signature"] = generateSignature(myData, passPhrase);

// Convert the data array to a string
const pfParamString = dataToString(myData);

// Generate payment identifier
const identifier = await generatePaymentIdentifier(pfParamString);
Step 2: Trigger the modal popup
Once you have successfully retrieved the above UUID for the payment you can pass that into the Javascript for the payment page initialisation.
Place the following script inside of your document to initialise the payment modal on your website.
There are 2 initialisation options for the modal that can be used depending on how you would like payment completion to be handled.
<script src="https://www.payfast.co.za/onsite/engine.js"></script>
Method 1: Simple
This is the simplest method of triggering the payment modal.
All that is needed is to specify the uuid you received in the first step.
On payment success the buyer is redirected to your return url.
Additionally, if you did not specify the return and cancel urls while getting the unique identifier in step 1, you can add these to the call in this step
Method 1 - Simple
window.payfast_do_onsite_payment({"uuid":"123-abc"}); 
Method 1 - With URLs
window.payfast_do_onsite_payment({
  "uuid":"123-abc",
  "return_url":"http://example.com",
  "cancel_url":"http://example.com"
}); 
Method 2: Callback
This method is triggered in the same way as the simple method, the difference is that with this method you can define a callback method.
On a final action (either a success or the user closing the popup) a call to the callback defined will be fired.
Method 2 - Callback
window.payfast_do_onsite_payment({"uuid":"123-abc"}, function (result) {
  if (result === true) {
    // Payment Completed
  }
  else {
    // Payment Window Closed
  }
}); 
Payment Confirmation
A payment confirmation notification will be sent to the "notify_url" you specified.
The full implementation details can be found here.

