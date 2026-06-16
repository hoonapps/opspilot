---
title: "Payment API Error Codes"
visibility: public
tags: payment,error-code,api
---

# Payment API Error Codes

## E101 Authentication Failed

E101 means the API key is missing, expired, or not allowed for the requested merchant.
CS should ask the merchant to rotate the API key from the developer console.

## E102 Payment Approval Timeout

Korean aliases: E102 에러, 결제 승인 타임아웃, 결제 API 타임아웃, 승인 지연 대응.
E102 means the payment gateway did not return an approval result within 10 seconds.
First check the gateway status page and the `payment.approval.timeout` metric.
If timeout count is above 30 per minute for 5 minutes, escalate to the payment on-call engineer.
Do not retry card approval manually from the admin console.

## E103 Insufficient Balance

E103 means the issuing bank rejected the payment because the balance was insufficient.
CS can guide the customer to use another card or payment method.
