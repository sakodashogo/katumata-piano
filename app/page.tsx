import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="px-6 h-16 flex items-center justify-between border-b border-white/50 bg-white/50 backdrop-blur-md sticky top-0 z-50">
        <div className="text-xl font-bold tracking-tight text-slate-900">
          ピアノ教室
        </div>
        <nav className="flex gap-4">
          <Link href="/login">
            <Button variant="ghost" size="sm">ログイン</Button>
          </Link>
        </nav>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 gap-12 text-center">
        <div className="space-y-6 max-w-2xl animate-in fade-in slide-in-from-bottom-8 duration-700">
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-slate-900">
            あなたのピアノを、<br className="hidden md:block" />もっと<span className="text-blue-600">自由に</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-600 max-w-lg mx-auto">
            レッスンの予約・振替・スケジュール管理を、
            かんたん・スムーズに。
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/login">
              <Button size="lg" icon>生徒ログイン</Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline">講師ログイン</Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-200">
          <Card className="bg-white/80 backdrop-blur-sm">
            <CardContent className="pt-6">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4 mx-auto text-blue-600 font-bold text-xl">1</div>
              <h3 className="font-semibold text-lg mb-2">かんたん予約</h3>
              <p className="text-slate-500">カレンダーから空き枠を選んで、すぐに予約できます。</p>
            </CardContent>
          </Card>
          <Card className="bg-white/80 backdrop-blur-sm">
            <CardContent className="pt-6">
              <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mb-4 mx-auto text-indigo-600 font-bold text-xl">2</div>
              <h3 className="font-semibold text-lg mb-2">多彩なメニュー</h3>
              <p className="text-slate-500">自主練・ソロレッスン・連弾レッスンから選べます。</p>
            </CardContent>
          </Card>
          <Card className="bg-white/80 backdrop-blur-sm">
            <CardContent className="pt-6">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mb-4 mx-auto text-purple-600 font-bold text-xl">3</div>
              <h3 className="font-semibold text-lg mb-2">リアルタイム通知</h3>
              <p className="text-slate-500">予約確定や振替時にメールで自動通知されます。</p>
            </CardContent>
          </Card>
        </div>
      </main>

      <footer className="py-6 text-center text-sm text-slate-400">
        &copy; 2026 ピアノ教室管理システム
      </footer>
    </div>
  );
}
