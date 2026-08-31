This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### 로컬 관리자 환경

로컬 PostgreSQL과 `.env.development.local` 설정이 준비된 개발 PC에서는 다음 명령 하나로 데이터베이스 마이그레이션과 개발 서버를 함께 실행한다.

```bash
npm run dev:local
```

`http://localhost:3000`을 열면 지정된 로컬 계정으로 자동 로그인한다. 서버를 끌 때는 실행한 터미널에서 `Ctrl+C`를 누르면 로컬 PostgreSQL도 함께 종료된다. 이 환경은 loopback 전용 `adventure_e2e` 데이터베이스를 사용하며 운영 데이터베이스에 연결하지 않는다.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
