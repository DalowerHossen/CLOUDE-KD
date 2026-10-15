# চ্যাট গাইড — ১৬টি STEP ১৬টি আলাদা চ্যাটে লেখার নিয়ম

সব বিস্তারিত নির্দেশনা রিপোর মধ্যে আছে (`CLAUDE.md`, `docs/execution/`, `docs/steps/`)। প্রতিটি নতুন চ্যাট সেগুলো নিজে পড়ে। তাই আপনাকে বড় ব্লক পেস্ট করতে হবে না; প্রতিটি চ্যাটে শুধু নিচের ছোট বার্তা পাঠাবেন।

## ১. শুরুর আগে

- প্রতিটি চ্যাট এই রিপোতে (`DalowerHossen/CLOUDE-KD`) খুলবেন।
- মূল ব্রাঞ্চ: `integration`। প্রতিটি চ্যাট সর্বশেষ `integration` থেকে নিজের সেশন-ব্রাঞ্চে কাজ করে এবং সেখানে পুশ করে।
- `integration`-এ মার্জ করে শুধু **ইন্টিগ্রেটর চ্যাট** (§৫)।

## ২. ক্রম

| ধাপ | কোন STEP | কীভাবে |
|---|---|---|
| ওয়েভ A | ০১ | একা শুরু করুন; শেষ হলে ইন্টিগ্রেটর চ্যাটে মার্জ |
| ওয়েভ B | ০২, ০৩, ০৪, ০৫, ০৬ | একসাথে পাঁচটি চ্যাট |
| ওয়েভ C | ০৭, ০৮, ০৯, ১০, ১৫, ১৬ | একসাথে ছয়টি চ্যাট |
| ওয়েভ D | ১১, ১২, ১৩, ১৪ | একসাথে চারটি চ্যাট (১১ ও ১২-তে প্রসেসর পিছু আলাদা চ্যাট নেওয়া যায়) |
| সবশেষে | রিলিজ গেট | ইন্টিগ্রেটর চ্যাট |

STEP ০১ মার্জ হলে চাইলে ০২–১৬ সবই একসাথে শুরু করতে পারেন। ইন্টিগ্রেটর STEP নম্বরের ক্রমে মার্জ করে।

## ৩. প্রতিটি চ্যাটে প্রথমে যা বলবেন

নিচের বার্তাগুলো হুবহু কপি করে সংশ্লিষ্ট চ্যাটে পাঠান।

**চ্যাট ১ — STEP ০১**
```
STEP 01 শুরু করো (Foundation, Contracts and Guardrails)। প্রথমে CLAUDE.md, docs/execution/STEP_PROTOCOL.md, OWNERSHIP_MAP.md, CONTRACTS.md, REQUIREMENTS_SPEC.md এবং docs/steps/STEP-01/SCOPE.md পড়ো। কোড লেখার আগে SCOPE থেকে SUBSTEPS.md ও PROGRESS.md বানিয়ে কমিট করো। তারপর এক এক করে সাব-স্টেপ লেখো, প্রতিটির পর যাচাই চালিয়ে কমিট ও পুশ করো। নিজের মালিকানার পাথের বাইরে কিছু লিখবে না। শেষে HANDOFF.md লেখো।
```

**চ্যাট ২ — STEP ০২**
```
STEP 02 শুরু করো (Data Core and Governance)। CLAUDE.md, docs/execution/ এর সব ফাইল এবং docs/steps/STEP-02/SCOPE.md পড়ো। প্রথমে SUBSTEPS.md ও PROGRESS.md বানিয়ে কমিট করো (কোড নয়)। তারপর এক এক করে সাব-স্টেপ লেখো; প্রতিটির পর যাচাই চালিয়ে কমিট ও পুশ করো। নিজের পাথের বাইরে কিছু লিখবে না। শেষে HANDOFF.md লেখো।
```

**চ্যাট ৩ — STEP ০৩**
```
STEP 03 শুরু করো (Authentication, Two-Factor and Account Lock)। CLAUDE.md, docs/execution/ এর সব ফাইল (বিশেষ করে REQUIREMENTS_SPEC.md এর REQ-LOCK) এবং docs/steps/STEP-03/SCOPE.md পড়ো। প্রথমে SUBSTEPS.md ও PROGRESS.md বানিয়ে কমিট করো (কোড নয়)। সাব-স্টেপ 03.1 এ Supabase এর সর্বশেষ অফিসিয়াল ডকুমেন্টেশন ইন্টারনেট থেকে পড়ে DECISIONS.md এ লেখো। তারপর এক এক করে সাব-স্টেপ লেখো; প্রতিটির পর যাচাই চালিয়ে কমিট ও পুশ করো। শেষে HANDOFF.md লেখো।
```

**চ্যাট ৪ — STEP ০৪**
```
STEP 04 শুরু করো (Security Shield, Fraud Signals and Security Operations)। CLAUDE.md, docs/execution/ এর সব ফাইল এবং docs/steps/STEP-04/SCOPE.md পড়ো। প্রথমে SUBSTEPS.md ও PROGRESS.md বানিয়ে কমিট করো (কোড নয়)। তারপর এক এক করে সাব-স্টেপ লেখো; Zero Trust ও Zero Tolerance চেকলিস্ট প্রতিটি সাব-স্টেপে প্রয়োগ করো; প্রতিটির পর যাচাই চালিয়ে কমিট ও পুশ করো। শেষে HANDOFF.md লেখো।
```

**চ্যাট ৫ — STEP ০৫**
```
STEP 05 শুরু করো (Encryption, File Storage and Email)। CLAUDE.md, docs/execution/ এর সব ফাইল (বিশেষ করে REQUIREMENTS_SPEC.md এর REQ-STORAGE) এবং docs/steps/STEP-05/SCOPE.md পড়ো। প্রথমে SUBSTEPS.md ও PROGRESS.md বানিয়ে কমিট করো (কোড নয়)। তারপর এক এক করে সাব-স্টেপ লেখো; প্রতিটির পর যাচাই চালিয়ে কমিট ও পুশ করো। শেষে HANDOFF.md লেখো।
```

**চ্যাট ৬ — STEP ০৬**
```
STEP 06 শুরু করো (Public Site, CMS, SEO and Marketing)। CLAUDE.md, docs/execution/ এর সব ফাইল এবং docs/steps/STEP-06/SCOPE.md পড়ো। প্রথমে SUBSTEPS.md ও PROGRESS.md বানিয়ে কমিট করো (কোড নয়)। তারপর এক এক করে সাব-স্টেপ লেখো; প্রতিটির পর যাচাই চালিয়ে কমিট ও পুশ করো। শেষে HANDOFF.md লেখো।
```

**চ্যাট ৭ — STEP ০৭**
```
STEP 07 শুরু করো (Onboarding, Tenant Settings, Team, KYC and Admin People)। CLAUDE.md, docs/execution/ এর সব ফাইল এবং docs/steps/STEP-07/SCOPE.md পড়ো। প্রথমে SUBSTEPS.md ও PROGRESS.md বানিয়ে কমিট করো (কোড নয়)। তারপর এক এক করে সাব-স্টেপ লেখো; প্রতিটির পর যাচাই চালিয়ে কমিট ও পুশ করো। শেষে HANDOFF.md লেখো।
```

**চ্যাট ৮ — STEP ০৮**
```
STEP 08 শুরু করো (Clients, Catalog, Inventory and Suppliers)। CLAUDE.md, docs/execution/ এর সব ফাইল এবং docs/steps/STEP-08/SCOPE.md পড়ো। প্রথমে SUBSTEPS.md ও PROGRESS.md বানিয়ে কমিট করো (কোড নয়)। তারপর এক এক করে সাব-স্টেপ লেখো; প্রতিটির পর যাচাই চালিয়ে কমিট ও পুশ করো। শেষে HANDOFF.md লেখো।
```

**চ্যাট ৯ — STEP ০৯**
```
STEP 09 শুরু করো (Invoicing Core, PDF, Projects and Reports)। CLAUDE.md, docs/execution/ এর সব ফাইল এবং docs/steps/STEP-09/SCOPE.md পড়ো। প্রথমে SUBSTEPS.md ও PROGRESS.md বানিয়ে কমিট করো (কোড নয়)। তারপর এক এক করে সাব-স্টেপ লেখো; প্রতিটির পর যাচাই চালিয়ে কমিট ও পুশ করো। শেষে HANDOFF.md লেখো।
```

**চ্যাট ১০ — STEP ১০**
```
STEP 10 শুরু করো (Payment Core and Super Admin Processor Connect)। CLAUDE.md, docs/execution/ এর সব ফাইল (বিশেষ করে REQUIREMENTS_SPEC.md এর REQ-ADMIN-CONNECT, REQ-CARD, REQ-VERIFY, REQ-NMI-MODES এবং PAYMENT_PROCESSORS.md) এবং docs/steps/STEP-10/SCOPE.md পড়ো। প্রথমে SUBSTEPS.md ও PROGRESS.md বানিয়ে কমিট করো (কোড নয়)। তারপর এক এক করে সাব-স্টেপ লেখো; কার্ডের তথ্য আমাদের কোডে কোথাও আসবে না; প্রতিটির পর যাচাই চালিয়ে কমিট ও পুশ করো। শেষে HANDOFF.md লেখো।
```

**চ্যাট ১১ — STEP ১১ (পুরো স্টেপ)**
```
STEP 11 শুরু করো (Payment Processor Adapters, Group 1)। CLAUDE.md, docs/execution/ এর সব ফাইল, বিশেষ করে PAYMENT_PROCESSORS.md ও REQ-DOC, এবং docs/steps/STEP-11/SCOPE.md পড়ো। প্রথমে SUBSTEPS.md ও PROGRESS.md বানিয়ে কমিট করো (কোড নয়)। প্রতিটি প্রসেসরের কোডের আগে তার নিজের ওয়েবসাইট থেকে সর্বশেষ অফিসিয়াল ডকুমেন্টেশন ইন্টারনেট থেকে এই সেশনে পড়ে docs/processors/<id>.md কমিট করো; স্মৃতি বা অনুমানে কোড লিখবে না; ডকুমেন্টেশন না পেলে থেমে আমাকে জানাও। ক্রম: stripe, paypal, braintree, square, authorizenet, bluesnap, verifone, payarc।
```
**একটি প্রসেসর আলাদা চ্যাটে (ঐচ্ছিক, STEP ১১/১২-তে)**
```
STEP 11 এর প্রসেসর stripe শুরু করো। CLAUDE.md, docs/execution/ এর সব ফাইল এবং docs/steps/STEP-11/SCOPE.md পড়ো, তারপর Stripe এর অফিসিয়াল ডকুমেন্টেশন ইন্টারনেট থেকে এই সেশনে পড়ে docs/processors/stripe.md কমিট করো, তারপর শুধু Stripe এর সাব-স্টেপ ক থেকে ঙ পর্যন্ত লেখো। অন্য প্রসেসরে হাত দেবে না।
```
(`STEP 11`/`stripe` বদলে যে STEP ও প্রসেসর id লাগে সেটি বসান।)

**চ্যাট ১২ — STEP ১২ (পুরো স্টেপ)**
```
STEP 12 শুরু করো (Payment Processor Adapters, Group 2, NMI দুই মোড সহ)। CLAUDE.md, docs/execution/ এর সব ফাইল, বিশেষ করে PAYMENT_PROCESSORS.md ও REQ-DOC ও REQ-NMI-MODES, এবং docs/steps/STEP-12/SCOPE.md পড়ো। প্রথমে SUBSTEPS.md ও PROGRESS.md বানিয়ে কমিট করো (কোড নয়)। প্রতিটি প্রসেসরের কোডের আগে তার নিজের ওয়েবসাইট থেকে সর্বশেষ অফিসিয়াল ডকুমেন্টেশন ইন্টারনেট থেকে এই সেশনে পড়ে docs/processors/<id>.md কমিট করো; স্মৃতি বা অনুমানে কোড লিখবে না। ক্রম: nmi (Collect.js ডিফল্ট ও Payment Component), adyen, paddle, fastspring, payproglobal, payoneer, rapyd, custom। Payment Component এর npm প্যাকেজ DEPENDENCY_REQUESTS.md এ লিখবে, নিজে package.json বদলাবে না।
```

**চ্যাট ১৩ — STEP ১৩**
```
STEP 13 শুরু করো (Client Portal, Contracts and Disputes)। CLAUDE.md, docs/execution/ এর সব ফাইল এবং docs/steps/STEP-13/SCOPE.md পড়ো। প্রথমে SUBSTEPS.md ও PROGRESS.md বানিয়ে কমিট করো (কোড নয়)। তারপর এক এক করে সাব-স্টেপ লেখো; পেমেন্ট পেজে কোনো অ্যানালিটিক্স বা ট্র্যাকিং স্ক্রিপ্ট থাকবে না; প্রতিটির পর যাচাই চালিয়ে কমিট ও পুশ করো। শেষে HANDOFF.md লেখো।
```

**চ্যাট ১৪ — STEP ১৪**
```
STEP 14 শুরু করো (Wallet, Merchant of Record, Payouts, Plans and Subscriptions)। CLAUDE.md, docs/execution/ এর সব ফাইল এবং docs/steps/STEP-14/SCOPE.md পড়ো। প্রথমে SUBSTEPS.md ও PROGRESS.md বানিয়ে কমিট করো (কোড নয়)। তারপর এক এক করে সাব-স্টেপ লেখো; পেমেন্ট পার্টনারের ব্র্যান্ড নাম কোথাও লিখবে না, শুধু জেনেরিক নাম; প্রতিটির পর যাচাই চালিয়ে কমিট ও পুশ করো। শেষে HANDOFF.md লেখো।
```

**চ্যাট ১৫ — STEP ১৫**
```
STEP 15 শুরু করো (Accounting, Expenses, Payroll and HR)। CLAUDE.md, docs/execution/ এর সব ফাইল এবং docs/steps/STEP-15/SCOPE.md পড়ো। প্রথমে SUBSTEPS.md ও PROGRESS.md বানিয়ে কমিট করো (কোড নয়)। তারপর এক এক করে সাব-স্টেপ লেখো; প্রতিটির পর যাচাই চালিয়ে কমিট ও পুশ করো। শেষে HANDOFF.md লেখো।
```

**চ্যাট ১৬ — STEP ১৬**
```
STEP 16 শুরু করো (Integrations and Automation)। CLAUDE.md, docs/execution/ এর সব ফাইল এবং docs/steps/STEP-16/SCOPE.md পড়ো। প্রথমে SUBSTEPS.md ও PROGRESS.md বানিয়ে কমিট করো (কোড নয়)। প্রতিটি বাইরের সেবা (WhatsApp, সোশ্যাল প্ল্যাটফর্ম, Shopify, WooCommerce, Plaid, Salt Edge, Google Cloud Vision) কোডের আগে তার অফিসিয়াল ডকুমেন্টেশন ইন্টারনেট থেকে এই সেশনে পড়ে নাও। তারপর এক এক করে সাব-স্টেপ লেখো; প্রতিটির পর যাচাই চালিয়ে কমিট ও পুশ করো। শেষে HANDOFF.md লেখো।
```

## ৪. চ্যাট মাঝপথে থেমে গেলে (চালিয়ে যাওয়া)

একই STEP নম্বর দিয়ে নতুন চ্যাটে:
```
STEP 07 চালিয়ে যাও। CLAUDE.md, docs/execution/STEP_PROTOCOL.md এবং docs/steps/STEP-07/SCOPE.md, SUBSTEPS.md, PROGRESS.md পড়ো। সর্বশেষ integration থেকে আপডেট নিয়ে প্রথম অসম্পূর্ণ সাব-স্টেপ থেকে শুরু করো। আগের সাব-স্টেপ আবার লিখবে না।
```
(`07` বদলে যে নম্বর লাগে সেটি বসান।)

## ৫. ইন্টিগ্রেটর চ্যাট (মার্জ করার জন্য আলাদা চ্যাট)

কোনো STEP শেষ হলে (বা একসাথে কয়েকটি শেষ হলে) নতুন চ্যাটে:
```
ইন্টিগ্রেটর হিসেবে কাজ করো। CLAUDE.md এবং docs/execution/INTEGRATION_CHECKLIST.md পড়ো। STEP 05 এর ব্রাঞ্চ <ব্রাঞ্চের নাম> integration এ মার্জ করো: মালিকানা যাচাই, DEPENDENCY_REQUESTS প্রয়োগ, npm run gen, মাইগ্রেশন পরিষ্কার ডেটাবেসে, SQL অ্যাসারশন, লিন্ট, টাইপচেক, বিল্ড, সব গার্ড। সব পাস করলে ট্যাগ দিয়ে integration এ পুশ করো। সমস্যা থাকলে কী ব্যর্থ হলো লিখে থামো।
```
(ব্রাঞ্চের নাম প্রতিটি STEP চ্যাট শেষে জানায়।)

সবশেষে (STEP ১৬ মার্জের পর):
```
ইন্টিগ্রেটর হিসেবে কাজ করো। docs/execution/INTEGRATION_CHECKLIST.md এর Release Gate (সেকশন D) এক এক করে চালাও এবং ফলাফল docs/RELEASE_REPORT.md এ লেখো।
```

## ৬. প্রতিটি চ্যাট শেষে আপনি কী দেখবেন

- `docs/steps/STEP-NN/PROGRESS.md` এর সব সাব-স্টেপ টিক দেওয়া।
- `docs/steps/STEP-NN/HANDOFF.md` আছে এবং "known issues" ফাঁকা বা "none"।
- চ্যাটের শেষ উত্তরে কমিটের তালিকা ও ব্রাঞ্চের নাম।
- সেই ব্রাঞ্চের নাম নিয়ে ইন্টিগ্রেটর চ্যাট (§৫)।

## ৭. কোন STEP-এর আগে কী প্রস্তুত রাখবেন

| STEP | প্রস্তুত রাখুন |
|---|---|
| ০১ | কিছু নয় |
| ০২–০৩ | Supabase প্রজেক্ট ও কী; SMTP |
| ০৪ | Cloudflare Turnstile কী; VPN/Proxy/Tor ডেটা সোর্স |
| ০৫ | Google Cloud OAuth ক্লায়েন্ট; `ENCRYPTION_KEY`, HMAC ও অডিট সাইনিং কী |
| ১০–১২ | প্রতিটি প্রসেসরের স্যান্ডবক্স অ্যাকাউন্ট ও কী (ড্যাশবোর্ডে বসাবেন, ফাইলে নয়) |
| ১৬ | WhatsApp, সোশ্যাল, Shopify/Woo, Plaid/Salt Edge, Google Vision এর স্যান্ডবক্স/ডেভেলপার অ্যাকাউন্ট |
| ডিপ্লয় | Netlify সাইট |
