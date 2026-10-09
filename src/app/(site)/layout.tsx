import { GeistSans } from 'geist/font/sans';
import './home.css';

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <div className={`home ${GeistSans.className}`}>{children}</div>;
}
