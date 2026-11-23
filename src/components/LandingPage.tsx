import React from 'react';
import {
  ArrowRight,
  BarChart3,
  Camera,
  CheckCircle2,
  FileSpreadsheet,
  KeyRound,
  Lock,
  Printer,
  QrCode,
  ScanText,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserCheck,
  Users,
  WifiOff,
} from 'lucide-react';
import { ADTEC_LOGO_DATA_URL } from '../assets/adtecLogo';

type TargetTab = 'scan' | 'key' | 'papers' | 'analysis' | 'students' | 'sheets';

interface LandingPageProps {
  onEnterApp: (tab?: TargetTab) => void;
  onOpenInstructorSetup: () => void;
  canInstallPwa: boolean;
  onInstallPwa: () => void;
  hasInstructorName: boolean;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onEnterApp,
  onOpenInstructorSetup,
  canInstallPwa,
  onInstallPwa,
  hasInstructorName,
}) => {
  const steps: Array<{
    num: string;
    title: string;
    desc: string;
    tip: string;
    icon: React.ReactNode;
    color: string;
    cta: string;
    action: () => void;
  }> = [
    {
      num: '01',
      title: 'Tetapkan Nama Pengajar (Sekali Sahaja)',
      desc: 'Isi Nama Pengajar (dan tandatangan digital jika mahu). Profil ini disimpan sekali sahaja pada PWA peranti anda dan muncul secara automatik di ruang "Disemak oleh:" bagi setiap kertas.',
      tip: 'Disimpan 100% dalam telefon/komputer anda sendiri.',
      icon: <UserCheck className="h-5 w-5" />,
      color: 'bg-blue-900 text-white',
      cta: hasInstructorName ? 'Kemaskini Profil' : 'Isi Nama Pengajar',
      action: () => {
        onEnterApp('scan');
        setTimeout(() => onOpenInstructorSetup(), 80);
      },
    },
    {
      num: '02',
      title: 'Cipta Ujian & Tetapkan Skema (1–60 Soalan)',
      desc: 'Tekan "Ujian Baru", pilih bilangan soalan secara manual (1 hingga 60 soalan), dan tanda jawapan betul A–D atau imbas kertas skema. Sistem menjana QR Code unik secara automatik untuk setiap ujian.',
      tip: 'Setiap ujian ada QR Code berbeza di penjuru kanan atas.',
      icon: <KeyRound className="h-5 w-5" />,
      color: 'bg-amber-500 text-white',
      cta: 'Buka Skema Jawapan',
      action: () => onEnterApp('key'),
    },
    {
      num: '03',
      title: 'Cetak Borang Jawapan OMR Rasmi',
      desc: 'Pergi ke tab Cetak untuk mencetak atau menyimpan PDF/PNG borang berlogo ADTEC JTM Kampus Kuantan — lengkap dengan QR Skema, ruang Nama/IC/Tarikh, 8 digit No. NDP, Kursus (AUTO–TPP), Semester (1–5), dan bulatan adaptif.',
      tip: 'Soalan sedikit = bulatan automatik lebih besar & penuh.',
      icon: <Printer className="h-5 w-5" />,
      color: 'bg-indigo-600 text-white',
      cta: 'Lihat & Cetak Borang',
      action: () => onEnterApp('sheets'),
    },
    {
      num: '04',
      title: 'Imbas Kertas Jawapan Dengan Kamera',
      desc: 'Buka tab Imbas dan halakan kamera pada 4 petak hitam di penjuru kertas. Sistem mengunci sudut secara automatik, membaca QR Skema (tak perlu pilih ujian secara manual!), menyahkod NDP, Kursus, Semester, tulisan Nama (OCR), dan terus menyemak jawapan.',
      tip: 'Kertas terbalik 180° turut dibetulkan secara automatik.',
      icon: <Camera className="h-5 w-5" />,
      color: 'bg-emerald-600 text-white',
      cta: 'Buka Pengimbas Kamera',
      action: () => onEnterApp('scan'),
    },
    {
      num: '05',
      title: 'Semak Visual, Sunting & Analisis Item',
      desc: 'Setiap kertas disemak memaparkan bulatan hijau (betul), merah (salah), kuning (jawapan skema), serta kotak KEPUTUSAN MARKAH (cth: 20/25 & 80%). Klik mana-mana soalan untuk sunting manual dan lihat graf taburan A–D di tab Analisis.',
      tip: 'Mudah mengesan soalan paling sukar dijawab pelajar.',
      icon: <BarChart3 className="h-5 w-5" />,
      color: 'bg-sky-600 text-white',
      cta: 'Lihat Analisis Item',
      action: () => onEnterApp('analysis'),
    },
    {
      num: '06',
      title: 'Kumpul Markah, Eksport Excel & Cetak Laporan',
      desc: 'Buka tab Pelajar untuk melihat markah terkumpul bagi semua penilaian mengikut No. NDP. Tapis mengikut Kursus & Semester, eksport terus ke fail Excel (.xlsx), atau tekan "Cetak Markah" untuk cetakan rasmi berlogo.',
      tip: 'Fail Excel mengandungi 2 helaian: Markah (%) & Butiran Betul.',
      icon: <FileSpreadsheet className="h-5 w-5" />,
      color: 'bg-teal-600 text-white',
      cta: 'Buka Jadual Pelajar',
      action: () => onEnterApp('students'),
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <img
              src="./pwa-192.png"
              alt="Ikon PWA OMR ADTEC"
              className="h-9 w-9 rounded-xl shadow-xs ring-1 ring-slate-200"
            />
            <img
              src={ADTEC_LOGO_DATA_URL}
              alt="Logo ADTEC JTM Kampus Kuantan"
              className="h-8 w-auto object-contain sm:h-9"
            />
          </div>

          <div className="flex items-center gap-2">
            {canInstallPwa && (
              <button
                type="button"
                onClick={onInstallPwa}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100"
              >
                <Smartphone className="h-4 w-4 text-amber-600" />
                <span className="hidden sm:inline">Pasang App</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onEnterApp('scan')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-900 px-4 py-2 text-xs font-bold text-white shadow-sm transition active:scale-95 hover:bg-blue-950 sm:text-sm"
            >
              Masuk Sistem
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-950 via-blue-900 to-slate-900 text-white">
        {/* Subtle decorative glow */}
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-amber-400/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-emerald-400/15 blur-3xl" />

        <div className="relative mx-auto max-w-6xl px-4 py-12 sm:py-16 lg:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1 text-xs font-bold text-amber-300 backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" />
                ADTEC JTM Kampus Kuantan • Aplikasi Web PWA
              </div>

              <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
                Semak Kertas Jawapan OMR{' '}
                <span className="text-amber-400">Sepantas 1 Saat</span> Dengan Kamera Telefon
              </h1>

              <p className="mt-4 max-w-xl text-sm leading-relaxed text-blue-100 sm:text-base">
                Direka khas untuk pengajar <strong>ADTEC JTM Kampus Kuantan</strong>. Cipta ujian
                1–60 soalan (A–D), cetak borang ber-QR rasmi, imbas kertas pelajar menggunakan
                kamera telefon, dan kumpul markah ke Excel (<code>.xlsx</code>) —{' '}
                <strong>100% percuma &amp; simpanan lokal dalam peranti anda sahaja</strong>.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => onEnterApp('scan')}
                  className="inline-flex items-center gap-2 rounded-2xl bg-amber-400 px-6 py-3.5 text-sm font-extrabold text-slate-950 shadow-lg shadow-amber-500/20 transition active:scale-95 hover:bg-amber-300"
                >
                  <Camera className="h-5 w-5" />
                  Mula Guna Sistem Sekarang
                  <ArrowRight className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => onEnterApp('sheets')}
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/25 bg-white/10 px-5 py-3.5 text-sm font-bold text-white backdrop-blur transition hover:bg-white/20"
                >
                  <Printer className="h-4 w-4" />
                  Lihat Contoh Borang OMR
                </button>
              </div>

              {/* Trust Badges */}
              <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-blue-200">
                <span className="inline-flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-emerald-400" />
                  Data tidak bercampur (Local Storage)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <QrCode className="h-3.5 w-3.5 text-amber-300" />
                  Auto-padan skema via QR
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <WifiOff className="h-3.5 w-3.5 text-sky-300" />
                  Sokong luar talian (PWA)
                </span>
              </div>
            </div>

            {/* Right Visual Summary Card */}
            <div className="lg:col-span-5">
              <div className="rounded-3xl border border-white/15 bg-white/10 p-5 shadow-2xl backdrop-blur-md">
                <div className="flex items-center gap-3 border-b border-white/15 pb-4">
                  <img
                    src="./pwa-192.png"
                    alt="OMR ADTEC Icon"
                    className="h-14 w-14 rounded-2xl shadow-md ring-2 ring-amber-400/50"
                  />
                  <div>
                    <div className="text-sm font-extrabold text-white">OMR ADTEC Kuantan</div>
                    <div className="text-xs text-blue-200">
                      Ringkas • Pantas • Mesra Telefon Pintar
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2.5 text-xs">
                  <div className="rounded-2xl bg-white/10 p-3">
                    <div className="text-lg font-extrabold text-amber-300">1–60</div>
                    <div className="mt-0.5 text-blue-100">Bilangan soalan manual (A–D)</div>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-3">
                    <div className="text-lg font-extrabold text-emerald-300">8 Digit</div>
                    <div className="mt-0.5 text-blue-100">No. NDP + 9 Kursus + 5 Sem</div>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-3">
                    <div className="flex items-center gap-1 text-sm font-extrabold text-sky-300">
                      <ScanText className="h-4 w-4" /> OCR Nama
                    </div>
                    <div className="mt-0.5 text-blue-100">Bacaan tulisan tangan automatik</div>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-3">
                    <div className="flex items-center gap-1 text-sm font-extrabold text-emerald-300">
                      <FileSpreadsheet className="h-4 w-4" /> Excel .xlsx
                    </div>
                    <div className="mt-0.5 text-blue-100">Kumpul markah ikut NDP &amp; Cetak</div>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl bg-emerald-500/20 px-3.5 py-2.5 text-xs font-medium text-emerald-100 ring-1 ring-emerald-400/30">
                  Tip pantas: Cuba butang <strong>&ldquo;Simulasi&rdquo;</strong> dalam tab Imbas
                  untuk melihat demonstrasi penuh QR, OCR, dan semakan tanpa perlu mencetak dahulu!
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6-Step Interactive Guide */}
      <section id="langkah" className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-blue-900">
            Panduan Langkah Demi Langkah
          </span>
          <h2 className="mt-3 text-2xl font-extrabold text-slate-900 sm:text-3xl">
            Cara Guna Sistem Semakan OMR
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Ikuti 6 langkah ringkas ini daripada mencipta ujian hingga mencetak laporan markah
            pelajar.
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {steps.map((step) => (
            <div
              key={step.num}
              className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-xl shadow-xs ${step.color}`}
                  >
                    {step.icon}
                  </div>
                  <span className="font-mono text-2xl font-black text-slate-200 group-hover:text-blue-200">
                    {step.num}
                  </span>
                </div>

                <h3 className="mt-4 text-base font-extrabold text-slate-900">{step.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">{step.desc}</p>
              </div>

              <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
                <div className="flex items-start gap-1.5 text-[11px] font-semibold text-emerald-700">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{step.tip}</span>
                </div>

                <button
                  type="button"
                  onClick={step.action}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-800 transition hover:bg-blue-900 hover:text-white"
                >
                  {step.cta}
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Scanning Best Practices + PWA Install Guide */}
      <section className="border-y border-slate-200 bg-white py-12">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 lg:grid-cols-2">
          {/* Tips for 100% Accurate OMR Scanning */}
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Tip Imbasan Kamera 100% Tepat
                </h3>
                <p className="text-xs text-slate-500">
                  Amalan terbaik semasa pelajar menjawab &amp; pengajar mengimbas
                </p>
              </div>
            </div>

            <ul className="mt-4 space-y-2.5 text-xs text-slate-700">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>
                  <strong>4 Petak Hitam Penjuru:</strong> Pastikan semua 4 petak penjuru masuk
                  ke dalam kotak panduan sehingga bertukar <strong>hijau</strong>.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>
                  <strong>QR Skema Kanan Atas:</strong> Jangan koyak, lipat, atau conteng QR Code
                  supaya sistem dapat memadankan skema secara automatik.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>
                  <strong>Tulisan Nama (OCR):</strong> Galakkan pelajar menulis nama menggunakan{' '}
                  <strong>HURUF BESAR</strong> yang kemas di garisan baris pertama.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>
                  <strong>Pencahayaan Sekata:</strong> Imbas di atas meja rata dan elakkan silau
                  lampu terus ke atas bulatan.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>
                  <strong>Mod Berterusan:</strong> Aktifkan <em>Imbasan Berterusan</em> untuk
                  menyemak setimbun kertas pelajar satu demi satu tanpa menekan butang.
                </span>
              </li>
            </ul>
          </div>

          {/* Install as Mobile App (PWA) + Privacy */}
          <div className="flex flex-col justify-between gap-4 rounded-3xl border border-blue-200 bg-blue-50/60 p-6">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-900 text-white">
                  <Smartphone className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-blue-950">
                    Pasang Di Telefon Seperti App (PWA)
                  </h3>
                  <p className="text-xs text-blue-800/80">
                    Akses pantas dari skrin utama tanpa perlu muat turun Play Store / App Store
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-blue-100 bg-white p-3.5 text-xs">
                  <div className="font-extrabold text-blue-950">Android (Chrome)</div>
                  <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-slate-600">
                    <li>Buka pautan ini di Google Chrome.</li>
                    <li>
                      Tekan butang <strong>Pasang App</strong> atau menu <strong>⋮</strong>.
                    </li>
                    <li>
                      Pilih <strong>Add to Home Screen / Install App</strong>.
                    </li>
                  </ol>
                </div>

                <div className="rounded-2xl border border-blue-100 bg-white p-3.5 text-xs">
                  <div className="font-extrabold text-blue-950">iPhone / iPad (Safari)</div>
                  <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-slate-600">
                    <li>Buka pautan ini di pelayar Safari.</li>
                    <li>
                      Tekan ikon <strong>Share (↑)</strong> di bahagian bawah.
                    </li>
                    <li>
                      Pilih <strong>Add to Home Screen</strong> → <strong>Add</strong>.
                    </li>
                  </ol>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-blue-200 bg-white p-3.5 text-xs text-slate-700">
              <div className="flex items-center gap-1.5 font-extrabold text-blue-950">
                <Users className="h-4 w-4 text-blue-700" />
                Privasi &amp; Simpanan Lokal Peranti
              </div>
              <p className="mt-1 leading-relaxed text-slate-600">
                Semua skema jawapan, nama pengajar, senarai pelajar (<code>AUTO, CSB, FSL, IT, JE, KIMP, REL, TPM, TPP</code>), dan markah disimpan secara lokal dalam{' '}
                <code>localStorage</code> peranti anda sahaja. Rekod anda tidak akan bercampur
                dengan pengajar lain.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA Footer */}
      <footer className="mx-auto max-w-6xl px-4 py-10 text-center">
        <h3 className="text-xl font-extrabold text-slate-900">
          Sedia Untuk Mula Menyemak Kertas Pelajar?
        </h3>
        <p className="mt-1.5 text-xs text-slate-500">
          Anda boleh membuka semula halaman panduan ini bila-bila masa melalui butang{' '}
          <strong>Panduan</strong> di bar atas aplikasi.
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => onEnterApp('scan')}
            className="inline-flex items-center gap-2 rounded-2xl bg-blue-900 px-6 py-3 text-sm font-extrabold text-white shadow-md transition active:scale-95 hover:bg-blue-950"
          >
            <Camera className="h-4 w-4" />
            Masuk ke Aplikasi OMR
          </button>
          {canInstallPwa && (
            <button
              type="button"
              onClick={onInstallPwa}
              className="inline-flex items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-3 text-sm font-bold text-amber-900 hover:bg-amber-100"
            >
              <Smartphone className="h-4 w-4 text-amber-600" />
              Pasang Sebagai App (PWA)
            </button>
          )}
        </div>

        <div className="mt-8 border-t border-slate-200 pt-5 text-[11px] font-medium text-slate-400">
          ADTEC JTM Kampus Kuantan • Sistem Semakan OMR Kamera (PWA)
        </div>
      </footer>
    </div>
  );
};
