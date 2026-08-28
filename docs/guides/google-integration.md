# Google Integration

Connecting a Google account gives HomeGlow two things:

- **Google Calendar** — two-way sync. Events from the calendars you choose appear
  in the Calendar widget, and events you create on the wall display are written
  back to Google.
- **Google Photos** — photos you pick appear in the Photo widget slideshow.

Both run through a **Google Cloud OAuth client that you create and own**. HomeGlow
ships no shared credentials, so nothing about your calendar or photos passes
through anyone else's project.

> **This takes about ten minutes**, and most of it is in the Google Cloud Console
> rather than HomeGlow. The two steps people miss are **enabling the APIs**
> (§2 — there are *two* of them) and **the redirect URI scheme** (§3).

## 1. Create the OAuth client

In the [Google Cloud Console](https://console.cloud.google.com/):

1. Create a project, or pick an existing one.
2. **APIs & Services → OAuth consent screen.** Choose **External**, fill in the
   app name and your email. You do **not** need to submit for verification —
   see [Verification](#verification-and-what-it-does-not-mean) below.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID.**
   Application type: **Web application**.
4. Leave the redirect URI blank for now — HomeGlow will tell you exactly what to
   paste in §3.
5. Keep the **Client ID** and **Client secret**.

## 2. Enable the APIs — both of them

**This is the step that most often goes wrong**, because nothing fails until you
try to use the feature, and then the error appears in a server log rather than on
screen.

Under **APIs & Services → Library**, enable:

| API | Needed for |
|---|---|
| **Google Calendar API** | the Calendar widget |
| **Google Photos Library API** | the Photos widget |
| **Google Photos Picker API** | the Photos widget — **a separate API from the one above** |

Photos needs **both** of the last two. Enabling only the Library API leaves photo
picking failing with a 403 that names the Picker API. Google caches the
disabled state briefly, so give it a minute or two before retrying.

## 3. Give HomeGlow the credentials

**Admin Panel → Connections → Google.**

1. Paste the **Client ID** and **Client secret**, then **Save Credentials**.
2. Look at the **Redirect URI** field. HomeGlow derives it from the address you
   are using, and there is a copy button beside it. **Copy that exact value** and
   add it to your OAuth client in the Cloud Console under *Authorized redirect
   URIs*. It must match character for character and must end in
   `/api/connections/google/callback`.

> **If the Redirect URI shows `http://` but you reach HomeGlow over HTTPS**, the
> field is editable — correct the scheme by hand and save. Google refuses any
> non-`localhost` redirect URI that is not HTTPS, so an `http://` value cannot be
> registered at all, and registering the `https://` form while HomeGlow sends
> `http://` produces `redirect_uri_mismatch`. This happens when TLS is terminated
> by a reverse proxy in front of the container.

Plain HTTP is fine without any of this if you reach HomeGlow at
`http://localhost:<port>` — Google exempts loopback addresses.

## 4. Authorize

Click **Authorize with Google** and complete the consent screen in the popup.

Because the app is unverified, Google shows an **"unverified app"** warning. Choose
**Advanced → Go to \<your app\> (unsafe)** to continue. That warning is about
Google not having reviewed *your own* OAuth client; the credentials never leave
your project.

Once connected, the panel shows the account and what it granted.

## 5. Calendars

**Admin Panel → Calendar sources → Add source → Google.** Pick which of the
account's calendars to show; each keeps its own colour in the Calendar widget.
Calendars shared with the account appear alongside its own.

## 6. Photos

**Photo widget → settings → Add source → type `Google Photos`.** Save the source
first, then use **Choose photos**. That opens Google's own picker in a new tab,
where you select the photos you want. HomeGlow polls until you are done, then
downloads the selected photos and lists them, with a delete button per photo.

> **Why a picker rather than browsing your albums?** Google removed the broad
> `photoslibrary.readonly` scope on 2025-03-31. The replacement scope only exposes
> media that the app itself created — which for HomeGlow is nothing. Picking is
> now the supported way for an app to reach photos you already have, and it means
> HomeGlow only ever sees the photos you explicitly hand it.

## Verification, and what it does not mean

Google requires apps requesting *sensitive* or *restricted* scopes to pass
verification **before publishing them to the general public**. A self-hosted
HomeGlow serving one household is not that: you created the OAuth client, you own
the project, and you are its only user. The unverified-app warning in §4 is the
normal and expected path.

Two things do change under verification pressure, and both are worth knowing:

- **Accounts enrolled in [Google's Advanced Protection Program](https://landing.google.com/advancedprotection/)
  cannot use unverified apps at all.** Authorization fails with
  `Error 400: policy_enforced`. This is **not** specific to Photos — an
  APP-enrolled account is refused even for Calendar alone. Use a different
  account for the display, or leave the program.
- **Publishing status affects token lifetime.** An app left in *Testing* issues
  refresh tokens that expire after **7 days**, which will disconnect your display
  every week. Set the consent screen to **In production** (this does not require
  verification) so the connection persists.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `Error 400: redirect_uri_mismatch` | The Redirect URI in HomeGlow and the one registered in the Cloud Console differ. Compare them character for character, including the scheme — see §3. |
| `Error 400: policy_enforced` | The Google account is enrolled in Advanced Protection, which refuses unverified apps. Use a different account. |
| Photo picking fails, or the photo list stays empty | One of the two Photos APIs is not enabled — see §2. The Picker API is separate from the Library API. |
| Connection drops every week | The OAuth consent screen is still in *Testing*. Set it to *In production*. |
| Calendar events do not appear | Check the calendar is selected in **Calendar sources**, and that the Google Calendar API is enabled. |
