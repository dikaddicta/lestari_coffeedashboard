# v44 Release Candidate Checklist

## Build

- [x] `npm run build`
- [x] `npm run check`
- [x] Release manifest matches runtime config
- [x] Social preview is 1200×630
- [x] Root, clean routes, public pages, release.json, and social image return HTTP 200 locally
- [x] Monitoring default is disabled
- [x] No active CNAME before final domain decision

## Supabase — must be completed by project owner

- [ ] Backup database before final validation
- [ ] Confirm migration v42 is applied
- [ ] Test RLS with Admin, QA, Brewer, Guest, and non-member accounts
- [ ] Test last-admin safeguards
- [ ] Test audit event visibility and immutability
- [ ] Configure and test custom SMTP
- [ ] Install and test Auth email templates

## End-to-end — must be completed on staging

- [ ] Signup and confirmation
- [ ] Login, logout, password reset, and session recovery
- [ ] Workspace creation and switching
- [ ] Beans and stock CRUD
- [ ] Brew creation and automatic stock deduction
- [ ] QA save and recommendation feedback
- [ ] Public brew moderation
- [ ] Analytics and report export
- [ ] Browser backup create, validate, and restore
- [ ] Offline/PWA behavior
- [ ] Mobile and desktop visual QA

## Production decision

- [ ] Legal documents reviewed
- [ ] Business identity and support owner finalized
- [ ] Domain chosen, verified, and HTTPS enabled
- [ ] Database backup and restore test documented
- [ ] Monitoring and privacy decision documented
- [ ] Release tagged in Git
- [ ] Rollback commit and ZIP retained
