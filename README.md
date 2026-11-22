# cost-band

A small Claude Code mod that shows what the current session has cost, in pounds,
and which advisor model is set. It adds one dim row above the message box, in the
Claude desktop app's Code tab and in the terminal:

`Session ~£0.96 · advisor: fable`

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
  `/cost` gives), converted from US dollars and refreshed after every turn. It is
  an estimate, not your bill. If a model has no known price, the row says
  "(some prices unknown)".
- **Advisor:** the `advisorModel` setting, or "off". A change made with
  `/advisor` for one session only is not shown.

## Limits

- Pounds use a fixed rate of $1.28 per £1, not a live rate. Change `USD_PER_GBP`
  in `hooks/register.tsx` to update it.
- One session at a time. It does not total spend across sessions.

## Tests

```bash
claude plugin test .
```
