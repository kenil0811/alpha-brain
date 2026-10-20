# The desk's phantom turn: the fix, for Kenil's yes

*20 Oct 2026, evening. The spike is `../log/2026-10-20-phantom-turn-spike.md`. No code until
his yes.*

## What is wrong

A prompt that lands while a turn of the desk is running is taken into that turn. Claude Code
runs its prompt hook, but gives it no turn and no result of its own. The desk counts a turn per
prompt hook, so it is left one turn ahead of Claude Code:
- the next sentence's result settles the wrong turn;
- the sentence waits out the 600 s silence limit;
- then the desk drops its client, ending the work running beside it.

It happens two ways:
- **E:** a piece of work finishes while the person's turn runs;
- **D:** the person types while Claude Code's own turn on finished work runs. In D the person's
  sentence also arrives mid-turn looking like an injection, and the model said so instead of
  answering it.

## The fix, in two parts

1. **A sentence waits for the boundary.** The desk sends the person's sentence only when no
   turn of its own is running, as the C1–C2 proposal said and the code never did.
   - While Claude Code's own turn on finished work runs, the sentence waits. The window shows
     it as sent, with the line "Alpha is finishing what it was saying".
   - Then it goes as a turn of its own, so it is never taken for an injection.
   - The wait is the length of that turn, usually a few seconds.
2. **A prompt that still lands inside a running turn belongs to that turn.** A prompt hook that
   fires while a turn is running starts no turn of its own.
   - **A finished piece of work's notification** joins the running turn: the "Work finished"
     line in the stream as now, and that turn's reply carries the work's id, so its chip shows.
     This is case E: the reply already tells the outcome, as the eggs reply did.
   - **A person's sentence** can still land inside a turn, if Claude Code starts its own turn
     in the instant the desk sends. That sentence's answer is the running turn's reply, and it
     is journaled once, as the reply to the sentence.

Each turn of the desk then gets exactly one result, its own.

## How it will be known to work

- **Tests**, with the scripted CLI the desk's tests use. Case E and case D are played as the
  spike saw them. In each, no turn waits, the next sentence gets its own result at once, and
  in D the sentence is sent only after Claude Code's turn ends.
- **Journeys**, with the real model: `two_things_at_once` and `go_ahead` again, with every
  sentence's turn ended by its own result, not by the silence limit.
- **In his app:** the sentences already given for section C's acceptance.

## Not in this fix

- **Losing the client's work after a silence:** dropping the client after 600 s of silence
  still ends the work beside the desk. With the phantom gone, a silence that long means the CLI
  itself hung. Whether to keep the work alive then is a separate question.
- **The 600 s limit** is unchanged.
