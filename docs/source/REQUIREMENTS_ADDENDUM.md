# REQUIREMENTS ADDENDUM (verbatim from the project owner - newest, highest precedence)

> This file is a verbatim record of the owner's latest instructions. Do not edit it.
> The formal English specification derived from it is docs/execution/REQUIREMENTS_SPEC.md.
> This directory (docs/source) is excluded from the English-only guard because it keeps the owner's original wording.

## A. Base prompt block

You are an expert full-stack software architect and senior engineer with 15+ years of experience building enterprise-grade SaaS platforms.

You are building "KD SOLUTION IT" - an enterprise multi-tenant SaaS invoicing, payment, payroll, and accounting platform for the Asian market.

### ABSOLUTE RULES (NEVER VIOLATE)

1. English ONLY - zero Bengali/Hindi/Chinese in code, UI, comments, seeds
2. USD ONLY - all money in numeric(18,4), never use JavaScript Number for money
3. Text data -> Supabase PostgreSQL | Files -> Google Drive (AES-256 encrypted)
4. NO test files (.test.ts, .spec.ts) - tests are excluded from this project
5. NO TODO, NO FIXME, NO "Coming Soon", NO placeholder text
6. NO `any` types - TypeScript strict mode everywhere
7. NO console.log - use structured logging
8. Every file starts with: // path: [file-path]
9. Every DB table has: id (UUID v7), company_id, created_at, updated_at, deleted_at
10. Every table has RLS enabled with default-deny policy
11. Every mutation has audit log entry
12. Every API has Zod validation (client + server)
13. Every input is sanitized (XSS, SQL injection, CSRF prevention)
14. Every payment has idempotency key
15. Every editable record has optimistic locking (version column)
16. Roles: super_admin > ceo > admin_staff > owner > staff (client = tokenized, no login)
17. All actions require approval chain (staff -> CEO -> super_admin)
18. Payment partner names: NEVER use bKash/Nagad/GCash/UPI - use "Global Payout Partners" or "Local Payment Methods via Licensed Partners"
19. Zero Trust + Zero Tolerance security on everything
20. VPN/Proxy/Tor detection and blocking on signup/payment/KYC/admin

### TECH STACK

- Next.js 14+ (App Router), TypeScript strict, Tailwind CSS, shadcn/ui
- Supabase (PostgreSQL + Auth + RLS + Realtime + pg_cron)
- Google Drive API (primary file storage, AES-256 encrypted)
- Payment: Stripe, PayPal, Paddle, NMI, Rapyd, Adyen, Custom (pluggable adapters)
- Email: Universal SMTP (Resend/SendGrid/SES/Mailgun/any)
- WhatsApp: Meta Cloud API
- Deploy: Netlify (primary), Docker/VPS (alternative)
- Monitoring: Sentry
- Security: Cloudflare Turnstile, DOMPurify, CSP nonce-based

### PROJECT STRUCTURE

- app/(public)/ - Public pages (no auth)
- app/(auth)/ - Login, signup, 2FA
- app/(dashboard)/ - Owner/Staff dashboard
- app/(admin)/ - Super admin/CEO/admin_staff
- app/(client-portal)/ - Tokenized client access (i/[token], e/[token])
- app/api/ - All API routes
- lib/ - Utilities, adapters, security, validation
- services/ - Business logic
- components/ - UI components
- migrations/ - SQL migrations
- config/ - nav-map, plans, permissions

For complete specification, I will provide feature details below.
Implement EVERY feature listed. Do NOT skip anything. For each file:
- Write complete code (no placeholders)
- Add path comment at top
- Use TypeScript strict mode
- Follow all 20 absolute rules

## B. Owner's working instructions (Bengali, verbatim)

কোন কোড না লিখে প্রথমে ধাপ ভাগ করো, এই প্রজেক্টকে তুমি কয়টি ধাপে ভাগ করেছো? ধাপগুলো কি কি, তুমি যে ধাপ লিখবে তার পরের ধাপ অন্য নতুন চ্যাটে লিখতে হবে। এইভাবে সবগুলো একসাথে শুরু করবো, কোন কনফ্লিক্ট বা ডুপ্লিকেট যেন না হয় সেই ভাবে নির্দেশনা এবং প্রস্তুতি করো এবং গিটে পুশ করো। প্রতিটি ধাপ লেখার পর তা গিটে কমিট করবে। STEP গুলো ১৬টি চ্যাটে লেখার জন্য আমাকে কি বলতে হবে - যেমন একটা চ্যাটে লিখবে এক, অন্য একটাতে দুই, তার পরেরটাতে তিন, চার - ঠিক এইভাবে আমি শুরু করতে চাই। এই পৃথক পৃথক চ্যাটে কি বলবো তুমি আমাকে বাংলায় উত্তর দাও এবং প্রতিটি চ্যাটে প্রথমেই আমাকে যা বলতে হবে একটা স্টেপ লেখার জন্য সেটার জন্য নির্দেশনা দাও বা কি বলতে হবে সেটা লিখে দাও। কোন কিছু বাদ যাবে না, সব ঠিক রাখবে।

ব্লকটি পেস্ট করলে কি সঠিকভাবে কোড লিখতে পারবে? তার চেয়ে ভালো হয় তুমি একটা নির্দেশনা লিখ যেখানে প্রতিবার নতুন নতুন চ্যাটে এই বিষয়টা ফলো করা হবে ও নির্ভুলভাবে লিখবে এবং একই টাইপের নির্দেশনা ফলো করে লিখবে যাতে প্রজেক্ট সফলভাবে লঞ্চ করা যায়। একটা স্টেপ একটা চ্যাটেই লিখবে। এই সাতটি স্টেপ এক চ্যাটেই লেখা সম্ভব নয়, তাই সে হিসেবে নির্দেশনা দাও - সাত জায়গায় সাতবার এক এক করে কোড লিখতে হবে, প্রথম স্টেপ থেকে শুরু। সে হিসেবে নির্দেশনা দাও। কোন স্টেপ শুরু হওয়ার আগে সেটি ছোট ছোট অংশে ভাগ করা হবে এবং সিকিউরিটির বিষয়ে জিরো ট্রাস্ট জিরো টলারেন্স।

শুধু পরিকল্পনা ও চ্যাটের নির্দেশনা কোথায় থাকলে প্রতিটি নতুন চ্যাটে নির্ভুল ও সঠিক কোড লেখা যাবে, তুমি তাই করবে।

তুমি বলেছ লাইভের জন্য আমার লাগবে: Supabase, Netlify, Google Drive, Cloudflare Turnstile ও SMTP অ্যাকাউন্ট ও কী, কিন্তু আমার উদ্দেশ্য হলো যদি Google Drive লিংক না করি তাহলে সবকিছু Supabase-এ থাকবে আর যদি লিংক করা থাকে তাহলে Google Drive-এ থাকবে শুধু ফাইল, কিন্তু টেক্সট ইনফো থাকবে Supabase-এ।

`integration` ব্রাঞ্চ এগুলো রাখবে, যেটা মেইন হিসেবে থাকবে।

## C. New requirements 1-8 (Bengali, verbatim)

1. API ডকুমেন্টেশন নিয়ম। প্রতিটি পেমেন্ট প্রসেসরের জন্য কোড লেখার আগে সংশ্লিষ্ট প্রসেসরের নিজের ওয়েবসাইটের সর্বশেষ অফিসিয়াল ডকুমেন্টেশন নতুন সেশনে ইন্টারনেট থেকে পড়তে হবে। কোনো স্মৃতি বা অনুমানের ভিত্তিতে কোড লেখা যাবে না।

2. প্রসেসরের তালিকা ও লিংক। স্ট্রাইপ (Stripe), NMI, Adyen, Verifone (2Checkout), Braintree (PayPal), BlueSnap, Square, Payoneer, FastSpring, Paddle, PayPro Global, PayPal (আলাদা), Payarc/PaymentCloud, Rapyd, Authorize.Net এবং Custom অ্যাডাপ্টার, মোট ১৬টি, শুরু থেকেই পরিকল্পনায় থাকবে। প্রতিটির অ্যাডাপ্টার আলাদা ফাইলে থাকবে, এবং একটি রেজিস্ট্রি ফাইলে সবগুলোর তালিকা থাকবে। ডকুমেন্টেশন ও স্যান্ডবক্স তাদের স্ব স্ব ওয়েবসাইট হতে দেখে লিখবে।

3. NMI-এর দুটি মোড। NMI-এর জন্য দুটি ফ্রন্টএন্ড মোড থাকবে এবং দুটোই রাখা হবে। প্রথমটি Collect.js, যা ডিফল্ট মোড। এর টোকেন একবারই ব্যবহার করা যায় এবং ২৪ ঘন্টা পর মেয়াদ শেষ হয়। দ্বিতীয়টি Payment Component, যার জন্য npm প্যাকেজ লাগবে। প্যাকেজ যোগ করার অনুরোধ ইন্টিগ্রেটরের মাধ্যমে যাবে, কারণ `package.json` ইন্টিগ্রেটরের মালিকানায়। দুই মোডেই সার্ভার থেকে পেমেন্ট একই শেয়ার্ড মডিউলে যাবে এবং NMI REST API ব্যবহার করবে। প্রতিটি প্রসেসরের মোড সুপার অ্যাডমিন ড্যাশবোর্ড থেকে বদলানো যাবে। একই সময়ে একটি প্রসেসরে একটি মোডই সক্রিয় থাকবে। মোড বদলানোর আগে নতুন মোডে সফল টেস্ট করতে হবে এবং প্রতিটি বদল অডিট লগে যাবে।

4. সুপার অ্যাডমিন থেকে API কানেক্ট। সুপার অ্যাডমিন ড্যাশবোর্ডের একটি পেজ থেকে যেকোনো প্রসেসরের API কী বসানো, টেস্ট করা এবং চালু বা বন্ধ করা যাবে, কোনো ডকুমেন্ট বদলানো বা নতুন করে ডিপ্লয় করা ছাড়া। এই পেজ শুধু সুপার অ্যাডমিন খুলতে পারবে, এবং এর জন্য 2FA ও নতুন করে পরিচয় যাচাই লাগবে। কী সংরক্ষণের আগে AES-256-GCM দিয়ে এনক্রিপ্ট হবে, এনক্রিপশন কী থাকবে পরিবেশ ভেরিয়েবলে, ডেটাবেসে নয়। সংরক্ষণের পর কী আর দেখানো হবে না, শুধু শেষের কয়েকটি অক্ষর ও শেষ আপডেটের সময় দেখাবে। টেস্ট সফল না হলে প্রসেসর চালু করা যাবে না। ড্যাশবোর্ড থেকে এমন প্রসেসর যোগ করা যাবে না যার অ্যাডাপ্টার কোডে নেই। রাউটিং নিয়ম কোনো মিলে না গেলে পেমেন্ট বাতিল হবে, অন্য প্রসেসরে পাঠানো হবে না।

5. লগইন লক। কোনো অ্যাকাউন্টে পরপর দুইবার ভুল পাসওয়ার্ড বা ভুল ২FA কোড দিলে সেই অ্যাকাউন্ট ২ ঘন্টার জন্য লক হবে। লক থাকাকালে সঠিক পাসওয়ার্ড দিলেও লগইন হবে না, পাসওয়ার্ড রিসেটও বন্ধ থাকবে, এবং পাসওয়ার্ড বদলালে লক খুলবে না। লক শুরু হলে মালিককে ইমেইলে সতর্কতা যাবে। অ্যাডমিন বা `admin_staff`-এর যার আনলক করার অনুমতি আছে, সে শুধু মালিকের সাথে ইমেইলে যোগাযোগ নিশ্চিত হওয়ার পরেই অ্যাকাউন্ট আনলক করতে পারবে, এবং প্রতিটি আনলক অডিট লগে যাবে। ব্যর্থ চেষ্টার গণনা ও লকের অবস্থা ডেটাবেসে থাকবে, যাতে সার্ভার রিস্টার্ট হলেও তা বজায় থাকে। এর পাশাপাশি IP-ভিত্তিক রেট লিমিটও থাকবে, এবং ভুল বার্তায় অ্যাকাউন্ট আছে কিনা তা প্রকাশ পাবে না।

6. কার্ড পেমেন্টের নিয়ম। কার্ড নম্বর, মেয়াদ ও CVV শুধু প্রসেসরের নিজস্ব সুরক্ষিত ফর্মে প্রবেশ করবে। আমাদের কোড বা সার্ভার কার্ড নম্বর পড়বে, সংরক্ষণ করবে বা কোনো কী-প্রেস ট্র্যাক করবে না। একটি ইনভয়েসে একটি কার্ড দিয়ে একবার সফল পেমেন্টের পর, সেই কার্ড দিয়ে একই ইনভয়েসে পরের ২৪ ঘন্টা আর পেমেন্ট হবে না। অন্য ইনভয়েসে এই নিয়ম প্রযোজ্য নয়। কার্ড-সম্পর্কিত বা প্রমাণীকরণের ব্যর্থতা (ভুল নম্বর, ভুল CVV, ভুল OTP বা 3DS ব্যর্থতা) ২৪ ঘন্টার মধ্যে একটি কার্ড টোকেনে দুইবার হলে তৃতীয়বারে সেই কার্ড আর গ্রহণ করা হবে না। ব্যালেন্স না থাকার ব্যর্থতা এই গণনায় ধরা হবে না। প্রসেসরের ফ্রড সিগন্যাল বা আমাদের ব্ল্যাকলিস্টে থাকা কার্ড সাথে সাথে প্রত্যাখ্যান হবে। ব্ল্যাকলিস্ট কার্ড টোকেন বা প্রসেসরের কার্ড ফিঙ্গারপ্রিন্টের ভিত্তিতে হবে, কার্ড নম্বরের ভিত্তিতে নয়। কার্ড ও IP-এর অত্যধিক চেষ্টা ঠেকাতে ভেলোসিটি লিমিটও থাকবে, যার ডিফল্ট সীমা কনফিগে রাখা হবে। সব টাকার হিসাব USD-তে হবে, `numeric(18,4)`-এ সংরক্ষিত হবে, এবং JavaScript Number দিয়ে কোনো হিসাব হবে না।

7. যাচাইকরণ। সম্ভব হলে প্রতিটি পেমেন্টে 3D Secure অনুরোধ করা হবে। 3DS সম্পন্ন না হলে পেমেন্ট তখনই হবে যখন বিলিং পোস্টাল কোড ও পেমেন্টকারীর IP দেশ দুটোই ইনভয়েসের তথ্যের সাথে মিলবে। এর যেকোনো একটি না মিললে পেমেন্ট ধরা হবে না এবং ম্যানুয়াল রিভিউ-এর তালিকায় যাবে। VPN, প্রক্সি ও Tor চেকও পেমেন্ট পেজে প্রযোজ্য থাকবে। প্রসেসরের ওয়েবহুক শুধু সিগনেচার যাচাই হলে গ্রহণ করা হবে, এবং প্রক্রিয়াকরণ হবে আইডেম্পটেন্ট।

8. ফাইল সংরক্ষণ। টেক্সট ও হিসাবের ডেটা সবসময় Supabase Postgres-এ থাকবে। ফাইল (PDF, ছবি, KYC নথি, লোগো ইত্যাদি) প্রতিষ্ঠানের Google Drive সংযুক্ত থাকলে সেখানে যাবে, না থাকলে Supabase Storage-এ যাবে। প্রতিটি ফাইল আপলোডের আগে AES-256-GCM দিয়ে এনক্রিপ্ট হবে এবং প্রতিটি ফাইল রেকর্ডে `storage_provider` লেখা থাকবে। ফাইল কোথায় যাবে তা রানটাইমে প্রতিষ্ঠান অনুযায়ী ঠিক হবে। কোনো প্রদানকারী উপলব্ধ না থাকলে স্বয়ংক্রিয়ভাবে অন্যটিতে যাবে, এবং ফাইল সরানোর একটি মাইগ্রেশন টুল থাকবে।

## D. PROVIDER LIST, DOCUMENTATION AND SANDBOX LINKS (starting points; verify each on the provider's own site)

1. Stripe
   - API: https://stripe.com/docs/api
   - Testing: https://stripe.com/docs/testing

2. NMI
   - Collect.js: https://docs.nmi.com/docs/collectjs
   - API: https://docs.nmi.com/
   - Sandbox: https://docs.nmi.com/docs/testing-sandbox
   - Index for agents: https://docs.nmi.com/llms.txt

3. Adyen
   - API: https://docs.adyen.com/
   - Testing: https://docs.adyen.com/development-resources/testing/

4. Verifone (2Checkout)
   - API: https://docs.verifone.com/
   - Sandbox: https://www.verifone.com/development-partner

5. Braintree (PayPal)
   - API: https://developer.paypal.com/braintree/docs
   - Sandbox: https://developer.paypal.com/braintree/help/sandboxHelp

6. BlueSnap
   - API: https://developers.bluesnap.com/
   - Index for agents: https://developers.bluesnap.com/llms.txt
   - Test mode: NOT https://developers.bluesnap.com/docs/test-mode (returns 404). Find the correct test-mode page in the index above.

7. Square
   - API: https://developer.squareup.com/docs
   - Sandbox: https://developer.squareup.com/docs/testing/sandbox

8. Payoneer
   - API: https://developer.payoneer.com/docs/payoneer-api-reference
   - Portal: https://developer.payoneer.com/

9. FastSpring
   - API: https://developer.fastspring.com/reference/api-overview
   - Sandbox: not provided. Find it in the FastSpring docs and record it.

10. Paddle
    - API: https://developer.paddle.com/
    - Sandbox: https://developer.paddle.com/sdks/sandbox/

11. PayPro Global
    - API: https://developers.payproglobal.com/docs/api/overview/
    - Sandbox: not provided. Find it in the PayPro Global docs and record it.

12. PayPal (standalone)
    - API: https://developer.paypal.com/api/rest/
    - Sandbox: https://developer.paypal.com/sandbox-testing/overview

13. Payarc / PaymentCloud
    - Docs: https://docs.payarc.net/
    - Sandbox: not provided. Find it in the Payarc docs and record it.

14. Rapyd
    - Docs: https://docs.rapyd.net/
    - Sandbox: not provided. Find it in the Rapyd docs and record it.

15. Authorize.Net
    - API: https://developer.authorize.net/api/reference/index.html
    - Sandbox info: https://developer.authorize.net/hello_world/sandbox.html
    - Testing guide: https://developer.authorize.net/hello_world/testing_guide.html

16. Custom
    - Generic adapter for an owner-defined HTTPS gateway. No provider-specific behaviour is hardcoded.

## E. Final directive (Bengali, verbatim)

তোমার প্রতি নির্দেশনা হলো তুমি প্রথমে এই প্রজেক্টের প্রতিটা অংশ ভালো মত গভীর মনোযোগের সাথে এনালাইজ করো, আমার কোন চাহিদা বাদ না যায়, নতুন সংযুক্তির জন্য যে তালিকা দিলাম তাও যেন যথাস্থানে থাকে, কোনকিছু বাদ দেওয়া যাবে না, নির্ভুল ও সঠিকভাবে কোড লিখতে হবে, তাই তুমি শুধু প্ল্যান করো। তুমি যে স্টেপে ভাগ করবে সেগুলো আবার ছোট ছোট ধাপে ভাগ করে আলাদা আলাদা নতুন নতুন চ্যাটে লেখা হবে। নির্দেশনা মতে শুরু করো, তুমি নিজে বাড়তি কিছু করবে না।
