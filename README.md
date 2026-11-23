# cost-band

A small Claude Code mod that shows what the current session has cost, in the
currency you choose, and which advisor model is set. It adds one row above the
message box, in the Claude desktop app's Code tab and in the terminal, with a
currency picker and the matching flag at the right-hand end:

`Session ~£0.84 (ECB 2026-11-20) · advisor: fable          [GBP] 🇬🇧`

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install cost-band --marketplace MarkAnthonyHardy/cost-band
```

Answer `y` to add the marketplace, then press Enter to install for your user. It
then loads in every session, including desktop app sessions.

From a shell instead:

```bash
claude plugin install cost-band --marketplace MarkAnthonyHardy/cost-band
```

## What it shows

- **Session cost:** Claude Code's own estimate of this session's spend (the figure
  `/cost` gives), refreshed after every turn. It is an estimate, not your bill. If
  a model has no known price, the row says "(some prices unknown)".
- **Currency:** pick one from the list at the right of the row. Your choice is
  remembered across sessions. The default is GBP.
- **Advisor:** the `advisorModel` setting, or "off". A change made with
  `/advisor` for one session only is not shown.

## Exchange rates

Rates come from the European Central Bank's daily euro reference rates
(<https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml>). The ECB says
they are usually updated at around 16:00 CET every working day, except on TARGET
closing days. The mod fetches each working day's rates once they are due (from
15:00 UTC), checking at the start of a session, after each turn and hourly while
a session sits idle. If the day's rates aren't out yet, or it is a TARGET
holiday, it tries again at most once an hour. The row shows the ECB date of the
rates in use. The currencies on
offer are the euro plus the 29 others the ECB publishes. US dollars need no
conversion. If the rates can't be fetched, the row falls back to US dollars and
says "(rates unavailable)".

The ECB says its reference rates are for information only, so treat the converted
figure as approximate.

## Limits

- One session at a time. It does not total spend across sessions.

## Tests

```bash
claude plugin test .
```
