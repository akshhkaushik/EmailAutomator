# Cold Email Format

## Research basis

The initial founder email uses a compact, evidence-led format based on current large-sample outreach research:

- Gong reports that 1–4 word subjects perform best with executives and that reply rates fall sharply above 100 words; its strongest range is 50–100 words.
- Gong's analysis of 304,174 emails found that cold-email calls to action asking for interest outperformed immediate meeting requests.
- Hunter's analysis of 11 million emails found relevance was the leading reply factor, while 71% of surveyed decision makers said they ignore messages that do not address relevant problems.
- Hunter's 34 million-email length study found shorter messages performed better, while explicitly warning that reply rate is not the same as positive-reply rate. The product therefore uses a practical 50–100 word range for founder outreach instead of optimizing for raw replies alone.
- Hunter's 2.2 million-email formatting study found much higher bounce rates for HTML campaigns than plain text. The generated copy therefore avoids decorative emphasis and marketing-style layout. Sending still provides a plain-text MIME alternative; links and optional tracking also create an HTML alternative.

Sources:

- [Gong: executive cold-email data](https://www.gong.io/blog/do-execs-really-reply-to-cold-email-here-s-what-the-data-says)
- [Gong: cold-email CTA analysis](https://www.gong.io/blog/this-surprising-cold-email-cta-will-help-you-book-a-lot-more-meetings)
- [Hunter: relevance research](https://hunter.io/blog/making-your-cold-emails-relevant-101/)
- [Hunter: cold-email word-count analysis](https://hunter.io/blog/cold-email-word-count/)
- [Hunter: plain text versus HTML analysis](https://hunter.io/blog/is-html-harming-your-cold-email-deliverability/)

These findings are correlations from vendor datasets, not guarantees. The learning loop should compare reply quality and sample sizes before recommending future format changes.

## Implemented initial format

1. Subject: 1–4 words, using the startup name and the concrete theme.
2. Observation: one short statement grounded in retrieved public evidence.
3. Contribution: one small system Aksh could build, tied to a plausible outcome such as activation, conversion, sales enablement, retention, or operational efficiency.
4. Credibility: a short BITS Pilani introduction, a general description of systems Aksh is building, a portfolio link, and the CV attachment note. Past projects are not listed.
5. CTA: one low-friction offer to send a one-page outline. The first email does not ask directly for a meeting.
6. Signature: accurate sender identity and contact links.

The editor shows subject and body word counts. Generated drafts avoid multiple questions, buzzwords, generic praise, unsupported ROI claims, and claims that a project was built without proof.

## Deliverability and compliance boundaries

- Gmail sending remains a one-recipient, explicitly approved action.
- The MIME message contains both plain-text and HTML alternatives.
- Open tracking remains optional because tracking pixels can be blocked or proxied.
- Verified recipients remain mandatory for automated selection.
- Google's sender guidance recommends authenticated mail and low spam rates. Gmail supplies authentication for the connected Gmail mailbox; a future custom sending domain would require SPF, DKIM, and preferably DMARC.
- If the system is used for commercial marketing, the sender is responsible for applicable rules. The FTC states that CAN-SPAM covers commercial B2B email and requires accurate headers and subjects, a postal address, an opt-out method, and prompt handling of opt-out requests.

References:

- [Google email sender guidelines](https://support.google.com/mail/answer/81126)
- [FTC CAN-SPAM compliance guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)

