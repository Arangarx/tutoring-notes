# Organization setup runbook

How an operator stands up one school, and what that school can do on the first day.
This is the support path for a real pilot. It is not a self-serve signup.

Screens for the school say **instructor** and **learner**. A tutor's own screens still say **student**.

## Before you start

The person who will own the organization must already have a **verified tutor account**
(they signed up, confirmed their email, and an operator approved them).
Creating an organization does not create that account.
A missing account and an unverified account look the same on the form:
"That person does not have a verified teaching account."
Test accounts cannot own an organization.

## Operator: create and activate

1. Sign in as an operator and open **Organizations** (`/admin/orgs`).
2. Enter the school name, the owner's email, and the time zone.
   The list is Eastern, Central, Mountain (`America/Denver`, the default), Arizona, Pacific, Alaska, and Hawaii.
   Appointment times and the week label on the organization schedule use this zone.
   You can change it later on the organization page (**Save time zone**).
3. Create the organization. It starts **pending**.
4. Open the organization and press **Activate organization**.
   Activating does not approve people who joined while it was pending.
   Those people stay on **Waiting for approval** until you approve them one by one.

Until the organization is active, staff cannot book a new appointment or open a new room.

## Roles

| Role | What they do |
|---|---|
| Owner | Invites people, adds learners, books, and is the last owner (you cannot remove the only owner). |
| Admin | Invites instructors and schedulers, adds learners, and books. Cannot grant owner. |
| Scheduler | Books, changes, and cancels appointments. Sees each learner's name and brief, not parent email, consent toggles, or notes. |
| Instructor | Sees their own appointments, opens the room, and opens sessions they taught. Does not see other instructors' appointments. |

An instructor must be an approved tutor, still a member, and still hold the instructor role.
A removed member, a person who is not approved, or a member without the instructor role cannot be booked.

## Owner: first day

1. Sign in and open **Organization**.
2. Invite instructors (and a scheduler or admin if someone else will book).
   They open the invitation, create or sign in to a verified tutor account, and accept.
   If the organization was still pending when they accepted, they wait for operator approval.
3. Add each learner (given name, family name, and a short brief). Send the family a claim link.
4. The family opens the link, claims the learner, and saves privacy (live session, audio, whiteboard, notes).
   Until that is saved, **Open room** stays off and the reason is on the screen.
   If live sessions are off, the room can still be opened in person, and the line under **Open room** says so.
5. Book an appointment: choose an instructor (nobody is preselected), the learner, the subject, and the time.
   The dialog says which time zone the clocks use. The row names the instructor, the learner, and the time.

## What the school cannot do yet

- See a school's-eye view of its instructors' notes or recordings. An instructor opens the sessions they taught. The owner and admin do not get the board, the audio, or the note from the organization record.
- Sign the school up without an operator. There is no self-serve organization signup.
- Bill the school, or see a billing page. Billing is not part of this pilot.

## Support checklist

Work top to bottom. Stop at the first no.

- [ ] Owner can sign in, and the account is verified and approved.
- [ ] Organization exists, the time zone is the school's zone, and the status is **Active**.
- [ ] The person who will teach has accepted an invite, is approved, and has the instructor role.
- [ ] The learner is on the organization, and the family has finished claim and privacy.
- [ ] The appointment lists that instructor and that learner, and the clock matches the organization time zone.
- [ ] **Open room** is either available, or it shows a one-line reason (privacy not finished, live sessions off, organization not active, instructor not admitted).
- [ ] If you meant to remove someone who is not in a live session, the remove button asks you to confirm first. Cancel leaves them in place.
