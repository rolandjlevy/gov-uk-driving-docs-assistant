import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'GOV.UK driving docs assistant',
  description: 'Answers UK driving questions from GOV.UK pages, cites the page, and says so when it is not covered. Unofficial demo.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB">
      <body>
        <header className="top"><a href="/">GOV.UK driving docs assistant</a><nav><a href="/">Ask</a><a href="/evals">Evals</a></nav></header>
        <main>{children}</main>
        <footer>
          Unofficial demo and not GOV.UK. Answers can be wrong: check the linked page before you rely on one.
          Page text is from GOV.UK under the <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/">Open Government Licence v3.0</a>.
          {' '}<a href="https://github.com/rolandjlevy/gov-uk-driving-docs-assistant">Source</a>
        </footer>
      </body>
    </html>
  );
}
