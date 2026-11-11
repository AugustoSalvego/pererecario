# GitHub workflow

This initial delivery includes a local Git repository and an initial commit on `main`. **Publishing requires a GitHub repository** in the owner's account.

## First publication — only once

1. On GitHub, create an **empty** repository named `pererecario` under `AugustoSalvego`. Do **not** initialize it with a README, `.gitignore`, or license.
2. Extract the delivered ZIP **including the hidden `.git` folder**.
3. Open a terminal in the extracted `pererecario` directory:

```bash
git status
git remote add origin https://github.com/AugustoSalvego/pererecario.git
git push -u origin main
```

If your archive utility omitted `.git`, create a new local history instead:

```bash
git init -b main
git add .
git commit -m "chore: initialize Pererecario visual kit v0.2"
git remote add origin https://github.com/AugustoSalvego/pererecario.git
git push -u origin main
```

## Everyday development

Fetch the latest work:

```bash
git pull --ff-only
```

After local changes:

```bash
git status
git add .
git commit -m "feat: describe a small improvement"
git push
```

On a second computer, clone once using:

```bash
git clone https://github.com/AugustoSalvego/pererecario.git
cd pererecario
```

For changes across devices, push on the first machine, then pull on the second. Avoid blindly copying older source folders over a newer clone. Never commit signing keys, `.env` files, or passwords.
