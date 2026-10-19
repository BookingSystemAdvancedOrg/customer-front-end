# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Guests of a restaurant that uses Booqy: people deciding where to eat, ordering
takeaway, booking a table, or ordering catering for work. Mostly on a phone,
often in a hurry or on the move (on the way home, standing in the queue,
sitting at the table after scanning the QR code), sometimes at a desk for
catering. Every age and level of tech comfort: the bar is "a child could do
it".

A second audience: Booqy's own sales demos, where this site is shown to
restaurant owners as what their guests will get.

## Product Purpose

The restaurant's own website on its own domain: menu, online ordering
(pickup and QR code at the table), table booking, catering requests, plus the
guest pages linked from SMS/email (manage or cancel a booking, follow an
order, see and sign a catering offer). Success is a guest who goes from
landing to a placed order or confirmed booking quickly and without doubt, and
a restaurant that gets more direct orders and bookings instead of losing them
to delivery apps and phone calls.

## Positioning

The guest is on the restaurant's own site, not a marketplace: no competing
restaurants, no app download, no account. Payments go straight to the
restaurant's Stripe account. Booking picks a real table on the restaurant's
own floor plan, with live availability.

## Operating Context

- One multi-tenant build. At start it calls `GET /site-config?host=` and gets
  the restaurant's name, branding (logo, hero image, primary colour, tagline,
  about text, social links), enabled features, locations and legal entity.
  No restaurant data lives in the code.
- Features are per restaurant and per location: reservations, ordering
  (pickup and/or table QR), catering. Pages and nav items exist only for
  enabled features.
- Multiple locations per restaurant; the guest picks one.
- Swedish only. Guests pay with card, Apple Pay and Google Pay (Stripe).
- Booking: guests always choose their table on the floor plan (confirmed
  requirement). Restaurants can have several floors; the floor being chosen
  from is in focus, the other floors stay visible behind it at low opacity.
  Card guarantee for larger parties, Turnstile bot check, 15-minute table
  hold.

## Capabilities and Constraints

- Public site: no login, no secrets, strict CSP (no external scripts beyond
  what is allowlisted), API only via public routes.
- Menu categories are fixed: Förrätter, Varmrätter, Efterrätter, Drycker.
  Dishes may or may not have a photo. Alcohol can only be ordered at the
  table.
- The restaurant's primary colour is the site's single accent, with computed
  readable text colours; branding values are sanitised server-side.
- React 19 + Vite + TypeScript, plain CSS. Tests with Vitest.

## Brand Commitments

The restaurant's identity leads: its name/logo, its colour, its photos. Booqy
is only a quiet "Drivs av Booqy" credit. The site must still look good for a
restaurant that has uploaded nothing (no logo, no photos, no colour).

## Evidence on Hand

Real restaurant content comes from each tenant's settings and menu at
runtime. There are no real testimonials, ratings or review counts; never
invent them. Demo screenshots use clearly fictional sample data.

## Product Principles

1. Fewest possible steps from landing to a placed order or confirmed booking.
2. The restaurant's brand, Booqy's quality: works for any restaurant, with or
   without photos.
3. Always obvious what to do next: one primary action per screen.
4. Phone first; desk second.
5. Never surprise a guest with money: prices, fees and guarantees are shown
   before they commit.

## Accessibility & Inclusion

Everyone, including children, older guests and people with low tech comfort:
large touch targets, plain Swedish, high contrast regardless of the
restaurant's colour, keyboard and screen-reader support (WCAG 2.1 AA).
