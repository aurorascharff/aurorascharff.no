---
author: Aurora Walberg Scharff
pubDatetime: 2023-12-30T15:22:00Z
title: Rebuilding "Remix Contacts" in Next.js 14
slug: rebuilding-remix-contacts-in-nextjs-14
featured: false
draft: true
tags:
  - React Server Components
  - Next.js
  - Remix
  - Server Actions
description: Remix Contacts is Remix's official tutorial. In this post, we'll rebuild it in Next.js 14 using React Server Components and Server Actions, and compare the two approaches.
---

## Table of contents

## The goal

- Duplicate the Remix Contacts tutorial in Next.js 14 using React Server Components and Server Actions, and focusing on mainataining progressive enhancement.
- Disclaimer: The nextjs way would maybe use more suspense but I wanted to replicate the remix tutorial as closely as possible.
- It also replaces the remix stylesheet with a tailwind one and uses Prisma instead of a fake db.

## Executing the rebuild

## The initial code

## Problem 1: Search params in layouts (failing prog enh)

- The search params are not being passed to the layout component, so the search params must be fetched from the client-side hook, breaking our prog-enhanced filtering. It also breaks prog-ench with suspense, which we have to use around the search-component.

## Problem 2: Global navigation events (make provider) and multiple buttons

- Maybe split this into a first solution and then generalizing later.
- We have to create our own provider to handle global navigation events, and we have to create a custom hook to handle the multiple buttons in the layout.

## Problem 3: Server actions

- Not automatically cancelling the previous request when a new one is made, causing problems with optimistic updates?

## Discussing the two approaches

### The Next.js approach

- More flexible and allows for more customization and composability.
- More familiar to React developers.
- Generates more components, which can be useful in the future. However it causes alot of files to be generated, which can be confusing.
- More complex and requires more boilerplate code.
- More difficult to learn and understand.
- Deviates from web standards
- Does not progressively enhance as well as the Remix approach.

### The Remix approach

- More straightforward and easier to learn and understand.
- More in line with web standards.
- Progressively enhances better.
- Less boilerplate code.
- Less "React-y" and more "HTML-y".
