# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Turborepo monorepo named "turborepo-bun-next-expo" containing a Next.js web application and an Expo React Native mobile application, sharing common UI components and configuration packages.

## Package Manager

This project uses **Bun** (v1.3.0) as the package manager. Always use `bun` commands instead of npm/yarn/pnpm.

## Monorepo Structure

### Apps

- **web**: Next.js 15.5+ app with React 19, using App Router and Turbopack
- **mobile**: Expo (v54) React Native app (v0.81.4) with React 19, Expo Router for navigation, NativeWind for styling

### Packages

- **@repo/ui**: Shared React component library (button, card, code components)
- **@repo/eslint-config**: Shared ESLint configurations (base, next-js, react-internal)
- **@repo/typescript-config**: Shared TypeScript configurations

## Key Architecture Details

### Monorepo Configuration

- The mobile app has its own `.git` directory within `apps/mobile/` (nested repository)
- `.npmrc` is configured with `node-linker=hoisted` for Expo/React Native compatibility
- Metro config in mobile app resolves modules from workspace root: `../../node_modules`
- Mobile app watchFolders set to `../../` to monitor entire monorepo

### Mobile App Specifics

- Uses Expo Router (v6) for file-based routing
- NativeWind (preview) for Tailwind CSS styling in React Native
- Configured with react-native-worklets (v0.5.1) and react-native-reanimated (~4.1.1)
- Babel plugin: `react-native-worklets/plugin`
- Metro config uses `withNativeWind` wrapper with `global.css` as input
- Package exports enabled: `unstable_enablePackageExports: true`

### Web App Specifics

- Next.js with Turbopack dev server on port 3000
- Uses `"use client"` directives in shared UI components
- App Router architecture (not Pages Router)

### Shared UI Package

- Exports individual components via `"./*": "./src/*.tsx"` pattern
- Components are client-side React components
- Import pattern: `@repo/ui/button`, `@repo/ui/card`, etc.

## Common Commands

### Installation

```bash
bun install
```

### Development

```bash
# All apps
bun dev

# Web app only
turbo dev --filter=web

# Mobile app only
bun mobile:start
# Or specific platform
cd apps/mobile && bun ios
cd apps/mobile && bun android
```

### Building

```bash
# All apps
bun build

# Web app only
turbo build --filter=web

# Mobile app prebuild
cd apps/mobile && bun prebuild
```

### Linting & Type Checking

```bash
# All packages
bun lint
bun check-types

# Mobile app only
bun mobile:lint

# Format code
bun format
```

### UI Component Generation

```bash
cd packages/ui
bun generate:component
```

## Important Considerations

### Working with Mobile App

- The mobile app is a nested Git repository - be careful with Git operations
- Always respect the hoisted node-linker configuration for React Native compatibility
- Metro bundler needs to resolve packages from monorepo root
- When adding dependencies, consider whether they need to be in mobile's package.json or root package.json

### Turborepo Task Dependencies

- `build` tasks depend on `^build` (upstream dependencies build first)
- `lint` and `check-types` follow same pattern
- `dev` tasks are persistent and not cached

### Package Resolutions

- `lightningcss: 1.30.1` is pinned at both root and mobile app levels

### React Native Worklets

- The mobile app uses react-native-worklets for animations
- Babel plugin must be configured before other plugins
- Compatible with react-native-reanimated v4

## Testing Strategy

Currently no test configuration is present in the repository.
