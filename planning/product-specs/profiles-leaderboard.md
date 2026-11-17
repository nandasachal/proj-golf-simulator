# Product Spec: Players, Leaderboard and Visitor Tracking

Status: proposed 2026-11-17
Eng plan: [../eng-plans/profiles-leaderboard.md](../eng-plans/profiles-leaderboard.md)

## What this is

Today a game lives and dies in one browser tab: nothing is saved, nobody knows
who played, and there is no reason to come back. This adds three things:

1. **A player name.** Type a name once; every game after that is saved under it.
2. **A leaderboard.** Who is playing and how good they are, ranked by the share
   of targets hit across all their games.
3. **Visitor tracking.** How many people come, and how many of them play.

The game itself is already shorter as of 2026-11-17: 5 targets, 3 to win
(4 in advanced).

## Who it's for

Sachal's friends and anyone they send the link to. Tens of players, not
thousands. That sets the bar: it has to be fun and fair between friends, not
cheat-proof against strangers.

## The player's path

1. **Arrive and play straight away.** No sign-up wall. The first game is
   anonymous.
2. **Finish a game, get asked for a name.** The end-of-game card says "3 of 5.
   Save it to the leaderboard?" with one name field. This is the moment they
   care most; asking earlier loses people.
3. **From then on it is automatic.** The name sits in the corner, every scored
   shot is saved, and the end-of-game card shows where they now stand.
4. **Leaderboard** opens from a trophy button: rank, name, hit %, games played,
   best streak. Their own row is always visible, even if they are 40th.

## Scoring rules

- **Score = targets hit ÷ targets attempted**, across every game, as a
  percentage. This is the ranking Sachal asked for.
- **Every scored shot counts the moment it lands**, not when the game ends.
  Otherwise a player protects their average by restarting any game that starts
  badly.
- **Minimum 3 games (15 targets) to be ranked.** Before that the player is
  listed as "warming up". Without a minimum, one lucky 1-for-1 tops the board.
- **Normal and Advanced have separate boards.** Air targets are much harder;
  one mixed average would punish anyone who tries Advanced.
- **Practice never counts.**
- Ties: more targets attempted ranks higher.

## Identity

A name, not an account. No email, no password.

- The first person to save a name owns it. The browser keeps a secret key that
  proves it on later visits, so nobody else can post scores as "Sachal".
- The cost: a new phone or a cleared browser is a new player. A short
  **recovery code** shown once ("write this down to use your name on another
  device") covers it.
- Names are 2 to 16 characters, unique regardless of capitals, and run through a
  basic profanity list.

## Gamification: what makes people come back

The psychology in one paragraph: people keep playing when they feel they are
**getting better** (competence), when the **next goal is close** (goal
gradient), when the outcome is **uncertain but fair** (variable reward), and
when **someone they know can see it** (social comparison). Short rounds and
instant feedback are the foundation, and the game already has both. Each idea
below is tagged with which lever it pulls.

**In the first build**

| Idea | Lever | What the player sees |
|---|---|---|
| Ask for the name after a game, not before | Endowed progress: they already have a score to lose | "3 of 5. Save it?" |
| Your row always shown, with the two players around you | Social comparison works with near rivals, not with a distant top 10 | "12. Sachal 58%" between 11th and 13th |
| "One more hit passes Varun" | Goal gradient | A line on the end-of-game card |
| This week and All time tabs | A weekly reset gives newcomers a board they can win | Two tabs |
| Near-miss wording | A near miss motivates almost as much as a hit | "2 yd short" is already there; keep it prominent |
| A real win moment | Reward has to be felt, not read | Confetti and a sound on a win; bigger for 5 of 5 |

**Second build**

| Idea | Lever | What the player sees |
|---|---|---|
| Ranks from hit % | Competence, visible progress | Hacker, Weekend Warrior, Single Digit, Scratch, Tour Pro |
| Personal bests | Competing with yourself works when the board is out of reach | Best streak, best week, longest target hit |
| Badges | Collection, surprise | First win, Perfect game, Three wins running, Every club, The 300 Club (a 300+ yd target hit) |
| Daily streak | Habit, loss aversion | "Played 4 days running" |

**Third build**

| Idea | Lever | What the player sees |
|---|---|---|
| Daily challenge | Fair comparison, one shared event a day | Everyone gets the same 5 targets; one attempt; its own board |
| Share the result | Brings new players | A copyable line of hit and miss squares with the link |

**Deliberately left out:** countdown timers, streak-loss warnings, points for
sale, notifications. They work, and they make a friendly game feel like a
slot machine.

## Visitor tracking

- **Who is visiting:** Cloudflare Web Analytics. The domain is already behind
  Cloudflare, it is free, uses no cookies and needs no consent banner. Gives
  visits, countries, devices and referrers.
- **Who is playing:** our own counts from the saved games: games started,
  games finished, names created, players returning within 7 days. That is the
  funnel that matters: visit, play, finish, save a name, come back.

## Out of scope

- Email or social sign-in.
- Playing against someone live.
- Cheat-proofing. Scores are worked out in the browser, so someone determined
  can post fake ones. The plan limits it (rate limits, impossible scores
  rejected, Sachal can remove a player) and stops there.

## Open decisions for Sachal

1. **Hosting cost.** The site is static today; names and a leaderboard need a
   small server and a database. See the eng plan for the two options.
2. **Advanced at 4 of 5.** Kept at the old 80%. Say if it should be 3 of 5 too.
3. **Minimum games to be ranked.** Proposed 3.
4. **Rank names.** Proposed above; they are yours to rename.
