# Deno Web Development Build Tool

## Features

- localhost live server
- production minification
    - JS/TS minification
    - CSS/SCSS minifiction
    - console.log removal
    - comment stripping

## Installation

### Prerequisites

1. Ensure you have node

    ```node --version```
2. Ensure you have NPM

    ```npm --version```
3. Install Deno onto your system
    - Mac/Linux (bash)S

        ```curl -fsSL https://deno.land/install.sh | sh```
    - Windows (powershell)

        ```irm https://deno.land/install.ps1 | iex```
4. Verify the installation

    ```deno --version```

## Getting Started

1. Basic commands
    - builds the src into dist and starts a live server

        ```deno task dev```
    - builds the src into prod, minfies and cleans

        ```deno task prod```
    - clears all files from both dist and prod folders

        ```deno task clean```