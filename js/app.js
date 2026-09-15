// ALUR: aktifkan mode ketat — error lebih cepat terdeteksi.
"use strict";

/* 
 A. KONSTANTA & KONFIGURASI
*/

const CONFIG = {
  // Endpoint API asli. Isinya berita luar negeri, jadi aplikasi
  // memakai data lokal (SEED) yang bentuknya sama persis.
  apiEndpoint: "https://front-end-firts.vercel.app/fal_coders",
  pageSize: 9,
  loadDelay: 550,
  chartTopN: 6,
  rankTopN: 10,
  toastDuration: 3200
};

const STORE_KEYS = {
  views: "nusakini.views.v1",
  read: "nusakini.read.v1",
  bookmarks: "nusakini.bookmarks.v1",
  users: "nusakini.users.v1",
  session: "nusakini.session.v1",
  theme: "nusakini.theme.v1",
  feedMode: "nusakini.feedMode.v1"
};


const PAGE_MODE = (document.body && document.body.getAttribute("data-page")) || "beranda";
const PAGE_KATEGORI = (document.body && document.body.getAttribute("data-kategori")) || "";
const BASE = (document.body && document.body.getAttribute("data-base")) || "";
const INDEX_URL = BASE + "index.html";

const routeUrl = (hash) => (PAGE_MODE === "beranda" ? hash : INDEX_URL + hash);

/** URL berkas HTML milik sebuah kategori. */
const categoryUrl = (slug) => BASE + "kategori/" + slug + ".html";

/** URL detail sebuah berita. */
const detailUrl = (article) => routeUrl("#/berita/" + article.id + "-" + article.slug);

/** URL absolut sebuah berita, untuk dibagikan ke media sosial. */
const shareUrlOf = (article) => {
  try {
    return new URL(INDEX_URL + "#/berita/" + article.id + "-" + article.slug, window.location.href).href;
  } catch (error) {
    return window.location.href;
  }
};

// ALUR: palet 6 warna grafik — nilainya merujuk variabel CSS sehingga otomatis menyesuaikan tema terang/gelap.
const CATEGORY_COLORS = [
  "var(--chart-1)", "var(--chart-2)", "var(--chart-3)",
  "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"
];

// Daftar kategori portal (slug -> label + keterangan)
const CATEGORIES = [
  { slug: "nasional", label: "Nasional", desc: "Kabar seputar kebijakan pemerintah, politik, dan peristiwa berskala nasional." },
  { slug: "daerah", label: "Daerah", desc: "Berita dari berbagai provinsi dan kota di Indonesia." },
  { slug: "ekonomi", label: "Ekonomi", desc: "Inflasi, rupiah, pasar modal, UMKM, dan kebijakan fiskal." },
  { slug: "olahraga", label: "Olahraga", desc: "Liga 1, tim nasional, bulu tangkis, hingga ajang internasional." },
  { slug: "teknologi", label: "Teknologi", desc: "Startup, keamanan siber, kecerdasan buatan, dan infrastruktur digital." },
  { slug: "hiburan", label: "Hiburan", desc: "Film, musik, selebritas, dan industri kreatif tanah air." },
  { slug: "kesehatan", label: "Kesehatan", desc: "Layanan kesehatan, gizi, dan gaya hidup sehat." },
  { slug: "otomotif", label: "Otomotif", desc: "Mobil dan motor baru, kendaraan listrik, serta kebijakan transportasi." },
  { slug: "internasional", label: "Internasional", desc: "Peristiwa dunia yang berdampak ke Indonesia." }
];

// ALUR: ubah array CATEGORIES menjadi peta { slug: 'Label' } (mis. {nasional:'Nasional'}) → pencarian label cukup sekali ambil.
const CATEGORY_LABELS = CATEGORIES.reduce((acc, cat) => {
  acc[cat.slug] = cat.label;
  return acc;
}, {});

// Kata kunci untuk menebak kategori bila data API tidak menyediakannya
const CATEGORY_KEYWORDS = {
  nasional: ["pemerintah", "presiden", "menteri", "dpr", "ruu", "kebijakan", "jakarta", "ibu kota", "polri", "kpu", "subsidi"],
  daerah: ["banjir", "provinsi", "kota", "bupati", "walikota", "mudik", "desa", "daerah", "banyuwangi", "semarang", "kalimantan"],
  ekonomi: ["inflasi", "rupiah", "ekspor", "impor", "umkm", "bank", "saham", "harga", "ekonomi", "investasi", "biaya", "tarif", "gaji"],
  olahraga: ["timnas", "liga", "pssi", "pertandingan", "atlet", "bulu tangkis", "sepak bola", "medali", "juara", "pelatih"],
  teknologi: ["aplikasi", "data", "digital", "internet", "kecerdasan buatan", "5g", "startup", "siber", "teknologi", "peretas"],
  hiburan: ["film", "penonton", "artis", "musik", "konser", "serial", "bioskop", "selebritas", "game", "album"],
  kesehatan: ["kesehatan", "rumah sakit", "dokter", "gizi", "bpjs", "penyakit", "vaksin", "stunting", "pasien"],
  otomotif: ["mobil", "motor", "kendaraan", "listrik", "otomotif", "pabrikan", "mesin", "hybrid", "spklu"],
  internasional: ["internasional", "global", "dunia", "asing", "pbb", "ktt", "negara"]
};

// Placeholder gambar berbentuk data URI SVG, jadi tetap tampil
// walau tidak ada koneksi internet.
const PLACEHOLDER_IMAGE = BASE + "assets/img/placeholder.svg";

/* 
 B. DATA BERITA
 Bentuk objek mengikuti bentuk respons API yang dipakai:
 { status, totalResults, articles: [{ source:{id,name}, author,
 title, description, url, urlToImage, publishedAt, content }] }
 Ditambah field lokal: category, views, tags.
*/

// Penanda waktu relatif terhadap saat aplikasi dimuat
const NOW = new Date();

// offsetJam: berapa jam sebelum waktu sekarang berita diterbitkan

// ALUR: ubah judul berita menjadi slug untuk URL: huruf kecil → buang tanda kutip → buang karakter aneh → spasi jadi tanda hubung → maks 60 karakter.
// Contoh: 'Harga BBM Naik!' → 'harga-bbm-naik'.
const slugify = (text) => String(text)
  .toLowerCase()
  .replace(/["']/g, "")
  .replace(/[^a-z0-9\s-]/g, "")
  .trim()
  .replace(/\s+/g, "-")
  .slice(0, 60);

/* 
   C. UTILITAS MURNI (tidak menyentuh DOM, mudah diuji)
*/

// ALUR: beri tanda balik pada karakter spesial regex (. * + ? dll) agar kata kunci pencarian aman dipakai membentuk pola RegExp.
const escapeRegExp = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Menghapus tanda markdown sederhana yang sering ada di field "content"
 * API berita, sehingga aman ditampilkan sebagai teks biasa.
 */
const cleanApiContent = (text) => String(text || "")
  .replace(/<[^>]*>/g, "")            // buang sisa tag HTML dari API
  .replace(/\[\+\d+ chars\]/g, "")    // buang penanda pemotongan NewsAPI
  .replace(/…\s*$/, "")
  .trim();

/** Normalisasi satu artikel agar field yang dipakai aplikasi selalu ada. */
const normalizeArticle = (article, index) => {
  const src = article || {};
  const source = src.source || {};
  const id = String(src.id || src.slug || src.url || "berita-" + (index + 1));
  const title = String(src.title || "Tanpa Judul");
  const rawContent = cleanApiContent(src.content);
  const description = String(src.description || src.description === "" ? src.description : "").trim();

  return {
    id,
    sourceId: source.id || null,
    sourceName: source.name || "Redaksi",
    author: src.author || "Redaksi",
    title,
    slug: slugify(title),
    description: description || rawContent.slice(0, 160),
    url: src.url || "#/berita/" + id,
    image: src.urlToImage || "",
    publishedAt: src.publishedAt || new Date(NOW.getTime() - index * 3600000).toISOString(),
    content: rawContent || description,
    paragraphs: splitParagraphs(rawContent || description),
    category: pickCategory(src.category || src.slug, title + " " + description + " " + rawContent),
    views: Number.isFinite(Number(src.views)) ? Number(src.views) : 120 + ((index + 1) * 137) % 900,
    tags: Array.isArray(src.tags) ? src.tags.slice(0, 5) : []
  };
};

/**
 * Menerima bentuk respons API apa pun lalu menghasilkan daftar artikel
 * yang sudah ternormalisasi.
 */
const normalizeApiPayload = (payload) => {
  const list = Array.isArray(payload && payload.articles)
    ? payload.articles
    : (Array.isArray(payload) ? payload : []);
  return list.map(normalizeArticle);
};

/** Membagi teks isi berita menjadi paragraf / subjudul / kutipan. */
const splitParagraphs = (text) => String(text || "")
  .split(/\n{2,}|\r\n{2,}/)
  .map((part) => part.trim())
  .filter(Boolean);

/**
 * Menebak kategori dari teks jika data tidak menyertakannya.
 * Dipakai bila aplikasi dihubungkan ke API eksternal yang tidak punya
 * field kategori.
 */
const pickCategory = (given, haystack) => {
  if (given && CATEGORY_LABELS[given]) return given;
  const text = String(haystack || "").toLowerCase();
  let best = "nasional";
  let bestScore = 0;
  CATEGORY_KEYWORDS && Object.keys(CATEGORY_KEYWORDS).forEach((slug) => {
    const score = CATEGORY_KEYWORDS[slug].reduce((total, word) => {
      const matches = text.match(new RegExp(escapeRegExp(word), "g"));
      return total + (matches ? matches.length : 0);
    }, 0);
    if (score > bestScore) {
      bestScore = score;
      best = slug;
    }
  });
  return bestScore === 0 ? "nasional" : best;
};

/** Format "12.480" (pemisah ribuan Indonesia). */
const formatNumber = (value) => new Intl.NumberFormat("id-ID").format(Number(value) || 0);

/** Format ringkas: 18.4 rb / 1,2 jt */
const formatCompact = (value) => {
  const num = Number(value) || 0;
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(".", ",") + " jt";
  if (num >= 1000) return (num / 1000).toFixed(1).replace(".", ",") + " rb";
  return String(num);
};

const MONTHS_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

const DAYS_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/** Tanggal lengkap berbahasa Indonesia, contoh: Senin, 1 September 2026 09.15 WIB */
const formatDateId = (iso) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  const jam = String(date.getHours()).padStart(2, "0");
  const menit = String(date.getMinutes()).padStart(2, "0");
  return DAYS_ID[date.getDay()] + ", " + date.getDate() + " " +
    MONTHS_ID[date.getMonth()] + " " + date.getFullYear() + " " + jam + "." + menit + " WIB";
};

/** Waktu relatif: "5 menit yang lalu", "3 jam yang lalu", "2 hari yang lalu" */
const timeAgo = (iso, now) => {
  const ref = now ? new Date(now).getTime() : Date.now();
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "-";
  const diff = Math.max(0, ref - time);
  const menit = Math.floor(diff / 60000);
  if (menit < 1) return "Baru saja";
  if (menit < 60) return menit + " menit yang lalu";
  const jam = Math.floor(menit / 60);
  if (jam < 24) return jam + " jam yang lalu";
  const hari = Math.floor(jam / 24);
  if (hari < 7) return hari + " hari yang lalu";
  const minggu = Math.floor(hari / 7);
  if (minggu < 5) return minggu + " minggu yang lalu";
  const bulan = Math.floor(hari / 30);
  if (bulan < 12) return bulan + " bulan yang lalu";
  return Math.floor(hari / 365) + " tahun yang lalu";
};

/** Perkiraan waktu baca berdasarkan jumlah kata. */
const readingTime = (article) => {
  const words = String((article && (article.content || article.description)) || "").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 180));
};

/** Potong teks agar tidak terlalu panjang di kartu. */
const truncate = (text, max) => {
  const str = String(text || "");
  if (str.length <= max) return str;
  return str.slice(0, max).replace(/\s+\S*$/, "") + "…";
};

/** Filter berdasarkan kategori (slug kosong = semua). */
const filterByCategory = (articles, slug) => {
  if (!slug || slug === "semua") return articles.slice();
  return articles.filter((item) => item.category === slug);
};

/** Urutkan dari yang terbaru. */
const sortNewest = (articles) => articles.slice().sort(
  (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
);

/**
 * Pencarian: kata kunci dipecah, seluruh kata harus cocok (AND)
 * pada gabungan judul, ringkasan, isi, penulis, kategori, dan tag.
 */
const searchArticles = (articles, query) => {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return articles.slice();
  const words = q.split(/\s+/).filter(Boolean);

  return articles
    .map((item) => {
      const haystack = [
        item.title, item.description, item.content, item.author,
        item.sourceName, CATEGORY_LABELS[item.category] || item.category
      ].concat(item.tags || []).join(" ").toLowerCase();

      let score = 0;
      const allMatch = words.every((word) => haystack.includes(word));
      if (!allMatch) return null;

      const title = String(item.title).toLowerCase();
      words.forEach((word) => {
        if (title.includes(word)) score += 6;
        if (title.startsWith(word)) score += 4;
        if (String(item.description).toLowerCase().includes(word)) score += 2;
      });
      return { item, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);
};

/** Gabungkan jumlah tayang dari API dengan kunjungan lokal pengguna. */
const mergeViews = (article, localViews) => {
  const local = Number((localViews || {})[article.id]) || 0;
  return {
    ...article,
    localViews: local,
    totalViews: (Number(article.views) || 0) + local
  };
};

/**
 * Skor trending: jumlah tayang diberi bobot kebaruan.
 * Berita yang lebih baru mendapat pengali lebih besar.
 */
const trendingScore = (article, now) => {
  const ref = now ? new Date(now).getTime() : Date.now();
  const ageHours = Math.max(1, (ref - new Date(article.publishedAt).getTime()) / 3600000);
  const decay = 72 / (72 + ageHours);
  return (Number(article.totalViews || article.views) || 0) * decay;
};

/** Peringkat trending berdasarkan jumlah tayang (terbanyak di atas). */
const rankByViews = (articles, limit) => articles
  .slice()
  .sort((a, b) => (b.totalViews || b.views || 0) - (a.totalViews || a.views || 0))
  .slice(0, limit || articles.length);

/** Sebaran jumlah pembaca per kategori. */
// ALUR: jumlahkan totalViews tiap kategori → datanya dipakai grafik cincin (donut) sebaran pembaca.
const viewsByCategory = (articles) => {
  const map = new Map();
  articles.forEach((item) => {
    const value = Number(item.totalViews || item.views) || 0;
    map.set(item.category, (map.get(item.category) || 0) + value);
  });
  return Array.from(map.entries())
    .map(([slug, views]) => ({
      slug,
      label: CATEGORY_LABELS[slug] || slug,
      views
    }))
    .sort((a, b) => b.views - a.views);
};

/** Pemotongan data untuk infinite scroll. */
const paginate = (items, page, size) => {
  const start = 0;
  const end = page * size;
  return {
    items: items.slice(start, end),
    hasMore: end < items.length,
    total: items.length,
    shown: Math.min(end, items.length)
  };
};

/** Geometri batang untuk grafik trending (dipakai pembuat SVG). */
const barChartGeometry = (rows, options) => {
  const opts = options || {};
  const labelWidth = opts.labelWidth || 168;
  const rowHeight = opts.rowHeight || 34;
  const barHeight = opts.barHeight || 16;
  const valueWidth = opts.valueWidth || 66;
  const chartWidth = opts.width || 620;
  const maxValue = Math.max(1, ...rows.map((row) => row.value));
  const barArea = Math.max(40, chartWidth - labelWidth - valueWidth);

  return {
    maxValue,
    labelWidth,
    valueWidth,
    barArea,
    width: chartWidth,
    height: rows.length * rowHeight + 8,
    rows: rows.map((row, index) => ({
      ...row,
      y: index * rowHeight + 8,
      barY: index * rowHeight + 8 + (rowHeight - barHeight) / 2,
      barWidth: Math.max(3, (row.value / maxValue) * barArea),
      height: barHeight
    }))
  };
};

/** Geometri cincin (donut) untuk sebaran kategori. */
const donutChartGeometry = (rows, options) => {
  const opts = options || {};
  const size = opts.size || 210;
  const radius = opts.radius || 74;
  const stroke = opts.stroke || 26;
  const total = Math.max(1, rows.reduce((sum, row) => sum + row.value, 0));
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return {
    size,
    radius,
    stroke,
    total,
    circumference,
    rows: rows.map((row) => {
      const fraction = row.value / total;
      const dash = fraction * circumference;
      const item = {
        ...row,
        fraction,
        percent: Math.round(fraction * 1000) / 10,
        dash,
        gap: circumference - dash,
        dashOffset: -offset
      };
      offset += dash;
      return item;
    })
  };
};

/* 
   D. PENYIMPANAN LOKAL (localStorage)
*/

/** Pembaca localStorage yang aman terhadap error / kuota penuh. */
const readStore = (key, fallback) => {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    console.warn("Gagal membaca localStorage:", key, error);
    return fallback;
  }
};

/** Penulis localStorage dengan penanganan error kuota. */
const writeStore = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn("Gagal menyimpan ke localStorage:", key, error);
    showToast("Penyimpanan browser penuh atau diblokir. Perubahan mungkin tidak tersimpan.", "warn");
    return false;
  }
};

// ALUR: hapus satu kunci dari localStorage (dipakai saat logout menghapus sesi).
const removeStore = (key) => {
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn("Gagal menghapus localStorage:", key, error);
  }
};

// ALUR: STATE PUSAT — seluruh kondisi aplikasi disimpan di satu objek ini: data artikel, status loading/error, rute aktif,
// status feed tiap kolom, akun yang masuk, daftar bookmark & riwayat baca, kata kunci, dan pilihan mode daftar.
const state = {
  articles: [],        // artikel ternormalisasi
  loading: true,  // true selama data dari API belum datang (memicu tampilan skeleton)
  error: null,  // diisi objek error ramah-pengguna bila pengambilan data gagal
  offline: false,
  meta: null,  // keterangan sumber data & waktu muat (dipakai di halaman error)
  route: { name: "home" },  // rute hash yang sedang aktif
  feeds: {},           // status infinite scroll tiap halaman
  user: null,  // akun aktif; null berarti pengunjung tamu
  bookmarks: [],  // id berita tersimpan milik akun/tamu aktif
  reads: [],           // id berita yang pernah dibuka akun aktif
  query: "",  // kata kunci pencarian terakhir
  searchCategory: "semua",  // filter kategori yang dipilih di halaman pencarian
  // mode tampilan daftar berita: "infinite" (gulir otomatis) atau "pages" (nomor halaman)
  feedMode: readStore(STORE_KEYS.feedMode, "infinite")
};

/* 
   E. SUMBER DATA & PENANGANAN ERROR
*/

/** Error aplikasi dengan kode & pesan yang ramah untuk pengguna. */
const makeError = (code, message, hint) => ({ code, message, hint: hint || "" });

/**
 * Mengambil data dari API eksternal.
 * Dipakai bila pengguna menghubungkan portal ke endpoint lain.
 */
const fetchRemoteArticles = async () => {
  let response;
  try {
    response = await fetch(CONFIG.apiEndpoint);  // LANGKAH 1: hubungi API; jaringan putus ditangkap catch di bawah
  } catch (networkError) {
    throw makeError(
      "NETWORK",
      "Tidak dapat terhubung ke server berita.",
      "Periksa koneksi internet kamu, lalu coba lagi."
    );
  }

  if (response.status === 429) {  // 429 Too Many Requests: jatah API habis
    throw makeError(
      "RATE_LIMIT",
      "Batas permintaan API habis (429 Too Many Requests).",
      "Tunggu beberapa menit lalu muat ulang halaman."
    );
  }
  if (response.status === 401 || response.status === 403) {  // 401/403: API menolak permintaan (kunci tidak valid)
    throw makeError("AUTH", "API menolak permintaan (kunci API tidak valid).", "Periksa kembali kunci API pada berkas konfigurasi.");
  }
  if (!response.ok) {  // status HTTP lain yang menandakan kegagalan server
    throw makeError("HTTP_" + response.status, "Server berita membalas dengan kode " + response.status + ".", "Coba lagi beberapa saat.");
  }

  let payload;
  try {
    payload = await response.json();  // LANGKAH 2: ubah teks JSON respons menjadi objek JavaScript
  } catch (parseError) {
    throw makeError("PARSE", "Data dari API tidak berformat JSON yang valid.", "Kemungkinan endpoint berubah. Periksa kembali alamat API.");
  }

  const rawList = Array.isArray(payload && payload.articles) ? payload.articles : (Array.isArray(payload) ? payload : []);
  const articles = normalizeApiPayload(payload);
  if (!articles.length) {  // API menjawab sukses tapi tidak mengandung berita
    throw makeError("EMPTY", "API tidak mengembalikan berita apa pun.", "Coba kata kunci atau kategori lain.");
  }
  return { articles, raw: rawList, meta: { source: "API eksternal", savedAt: new Date().toISOString(), count: articles.length } };
};

/**
 * Alur pemuatan data — mengambil dari API asli:
 *   1. Ambil data dari CONFIG.apiEndpoint
 *   2. Kalau API gagal / kosong / formatnya salah -> lempar error,
 *      lalu ditampilkan di halaman error beserta tombol "Coba Lagi"
 */
const loadArticles = async () => {
  await delay(CONFIG.loadDelay);

  const remote = await fetchRemoteArticles();
  return { articles: remote.articles, meta: remote.meta };
};

// ALUR: jeda buatan (Promise + setTimeout) agar skeleton loading sempat terlihat — meniru jeda jaringan sungguhan.
const delay = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/* 
   F. PEMBANGUN ELEMEN UI (DOM BUILDER)
*/

/** Membuat elemen HTML + atribut + kelas + teks. */
const appendChildren = (node, children) => {
  if (children === null || children === undefined || children === false) return;

  // Array (termasuk array bersarang hasil .map()) diratakan dulu
  if (Array.isArray(children)) {
    children.forEach((child) => appendChildren(node, child));
    return;
  }
  node.appendChild(typeof children === "string" ? document.createTextNode(children) : children);
};

const el = (tag, options, children) => {
  // ALUR (fungsi el()): langkah 1 — buat elemen kosong sesuai tag.
  const node = document.createElement(tag);
  const opts = options || {};

  // ALUR (el): langkah 2 — pasang kelas CSS; satu string boleh berisi beberapa kelas.
  if (opts.className) {
    String(opts.className).split(/\s+/).filter(Boolean).forEach((cls) => node.classList.add(cls));
  }
  // ALUR (el): langkah 3 — pasang atribut (href, aria-*, data-*, type, dll). Nilai false/null dilewati.
  if (opts.attrs) {
    Object.keys(opts.attrs).forEach((name) => {
      const value = opts.attrs[name];
      if (value !== null && value !== undefined && value !== false) {
        node.setAttribute(name, String(value));
      }
    });
  }
  // ALUR (el): langkah 4 — teks dibuat sebagai createTextNode → aman dari injeksi HTML, tanda < > tampil apa adanya.
  if (opts.text !== undefined && opts.text !== null) {
    node.appendChild(document.createTextNode(String(opts.text)));
  }
  // ALUR (el): opsi hidden:true membuat elemen langsung tersembunyi.
  if (opts.hidden) node.hidden = true;
  if (children !== undefined) appendChildren(node, children);
  return node;
};

/** Membuat elemen SVG (namespace berbeda dari HTML). */
const svgEl = (tag, attrs, children) => {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.keys(attrs || {}).forEach((name) => {
    node.setAttribute(name, String(attrs[name]));
  });
  if (children) {
    (Array.isArray(children) ? children : [children]).forEach((child) => {
      if (child) node.appendChild(child);
    });
  }
  return node;
};

/** Ikon inline SVG. */
// ALUR: peta nama→bentuk SVG tiap ikon. Fungsi icon() memakai nama di sini untuk membentuk kelas 'ikon-<nama>';
// bentuk visualnya dirender dari file assets/ikon/*.svg melalui CSS mask (warna ikut currentColor).
const ICON_PATHS = {
  bookmark: "M6 3.8h12a1 1 0 0 1 1 1v15.4l-7-4.6-7 4.6V4.8a1 1 0 0 1 1-1z",
  share: "M8.6 13.5 15.4 17m0-10L8.6 10.5M18 8.4a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2zM6 15.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2zm12 8.2a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z",
  eye: "M1.8 12S5.6 5.4 12 5.4 22.2 12 22.2 12 18.4 18.6 12 18.6 1.8 12 1.8 12z",
  clock: "M12 6.6V12l3.6 2.2",
  back: "M19 12H6m5-6-6 6 6 6",
  user: "M12 12.2a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6zM4.6 20.2c1.2-3.8 4-5.8 7.4-5.8s6.2 2 7.4 5.8",
  link: "M10.5 13.5a3.8 3.8 0 0 0 5.6.4l2.4-2.4a3.9 3.9 0 0 0-5.5-5.5l-1.4 1.4M13.5 10.5a3.8 3.8 0 0 0-5.6-.4l-2.4 2.4a3.9 3.9 0 0 0 5.5 5.5l1.4-1.4",
  fire: "M12 2.6s4.6 3.6 4.6 8.2a4.6 4.6 0 1 1-9.2 0c0-1.6.7-2.9 1.5-3.8 0 1.4.9 2.4 1.9 2.4 1.3 0 2-1.4 1.2-6.8z",
  check: "M4.8 12.6l4.6 4.6L19.2 7.4",
  trash: "M4.8 6.6h14.4M9.4 6.6V4.4h5.2v2.2M6.6 6.6l1 13.2h8.8l1-13.2",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm5 0 5.2 5.2"
};

const icon = (name, className) =>
  // Ikon kini berupa berkas SVG (assets/ikon/) yang dicat melalui CSS mask,
  // sehingga warnanya tetap mengikuti currentColor untuk tema & hover.
  el("span", {
    className: "ico ikon-" + (ICON_PATHS[name] ? name : "link") + (className ? " " + className : ""),
    attrs: { "aria-hidden": "true" }
  });

/** Gambar berita dengan fallback bila gagal dimuat. */
const articleImage = (article, className) => {
  const img = el("img", {
    attrs: {
      src: article.image || PLACEHOLDER_IMAGE,
      alt: article.title,
      loading: "lazy",
      decoding: "async"
    }
  });
  img.addEventListener("error", () => {
    if (img.getAttribute("src") !== PLACEHOLDER_IMAGE) {
      img.setAttribute("src", PLACEHOLDER_IMAGE);
    }
  });
  const wrapper = el("div", { className }, img);
  return wrapper;
};

/** Baris meta: sumber • waktu • jumlah dibaca */
const metaLine = (article, options) => {
  const opts = options || {};
  const wrap = el("div", { className: opts.className || "card-meta" });
  wrap.appendChild(el("strong", { text: article.sourceName }));
  wrap.appendChild(el("span", { className: "meta-dot", text: "•" }));
  wrap.appendChild(el("span", { text: timeAgo(article.publishedAt) }));
  if (opts.showViews !== false) {
    wrap.appendChild(el("span", { className: "meta-dot", text: "•" }));
    const views = el("span", { className: "stat-inline" }, [icon("eye", "ico-sm"), formatCompact(article.totalViews || article.views)]);
    wrap.appendChild(views);
  }
  return wrap;
};

/* =========================================================
 F.1 KARTU BERITA
 ========================================================= */

// ALUR: cek apakah id berita ada di daftar bookmark akun/tamu aktif (dipakai untuk menandai tombol simpan).
const isBookmarked = (id) => state.bookmarks.indexOf(String(id)) !== -1;

// ALUR: MEMBANGUN 1 KARTU BERITA (dipakai di semua grid). Urutan pembuatan:
// 1) thumbnail gambar + pil kategori + (opsional) nomor peringkat,
// 2) judul = tautan ke halaman detail, 3) ringkasan dipotong 132 karakter,
// 4) baris meta (sumber • waktu • pembaca), 5) tombol simpan & bagikan.
const createCard = (article, options) => {
  const opts = options || {};
  const link = detailUrl(article);

  const titleLink = el("a", {
    className: "card-title",
    attrs: { href: link },
    text: article.title
  });

  const saveBtn = el("button", {
    className: "icon-btn bookmark-toggle" + (isBookmarked(article.id) ? " is-saved" : ""),
    attrs: { type: "button", "aria-label": "Simpan berita", "data-id": article.id }
  }, icon("bookmark"));
  saveBtn.addEventListener("click", (event) => {
    event.preventDefault();
    toggleBookmark(article.id);
  });

  const shareBtn = el("button", {
    className: "icon-btn",
    attrs: { type: "button", "aria-label": "Bagikan berita" }
  }, icon("share"));
  shareBtn.addEventListener("click", (event) => {
    event.preventDefault();
    openShare(article);
  });

  const thumb = articleImage(article, "card-thumb");
  thumb.appendChild(el("span", { className: "card-cat", text: CATEGORY_LABELS[article.category] || article.category }));
  if (opts.rank) {
    thumb.appendChild(el("span", { className: "rank-no", text: "#" + opts.rank }));
  }

  return el("article", { className: "card fade-up" }, [
    thumb,
    el("div", { className: "card-body" }, [
      titleLink,
      el("p", { className: "card-excerpt", text: truncate(article.description, 132) }),
      el("div", { className: "card-foot" }, [
        metaLine(article),
        el("div", { className: "card-actions" }, [saveBtn, shareBtn])
      ])
    ])
  ]);
};

/** Kerangka kartu saat data belum datang. */
const createCardSkeleton = () => el("div", { className: "card skeleton-card", attrs: { "aria-hidden": "true" } }, [
  el("div", { className: "skeleton sk-thumb" }),
  el("div", { className: "sk-body" }, [
    el("div", { className: "skeleton sk-line h-lg w-90" }),
    el("div", { className: "skeleton sk-line h-lg w-70" }),
    el("div", { className: "skeleton sk-line w-90" }),
    el("div", { className: "skeleton sk-line w-50" })
  ])
]);

const createHeroSkeleton = () => el("div", { className: "hero" }, [
  el("div", { className: "skeleton", attrs: { "aria-hidden": "true" } }),
  el("div", { className: "hero-side" }, [1, 2, 3].map(() => el("div", { className: "sk-side" }, [
    el("div", { className: "skeleton sk-side-thumb" }),
    el("div", { className: "sk-side-lines" }, [
      el("div", { className: "skeleton sk-line w-90" }),
      el("div", { className: "skeleton sk-line w-70" }),
      el("div", { className: "skeleton sk-line w-50" })
    ])
  ])))
]);

const createChartSkeleton = () => el("div", { className: "charts-wrap" }, [1, 2].map(() => el("div", { className: "panel" }, [
  el("div", { className: "skeleton sk-line h-lg w-50" }),
  el("div", { className: "skeleton sk-line w-70" }),
  [1, 2, 3, 4, 5].map(() => el("div", { className: "skeleton sk-chart" }))
])));

/** Kosongkan isi kontainer */
const clearNode = (node) => {
  while (node.firstChild) node.removeChild(node.firstChild);
};

/** Isi kontainer dengan daftar simpul. */
const fillNode = (node, nodes) => {
  clearNode(node);
  nodes.forEach((child) => node.appendChild(child));
};

/* 
 G. RENDER HALAMAN
*/

// ALUR: 'kamus elemen DOM'. cacheDom() mengisi objek ini dengan referensi semua elemen penting berdasarkan id,
// sehingga kode lain cukup menulis dom.homeGrid tanpa getElementById berulang.
const dom = {};
const cacheDom = () => {
// ALUR: peta id DOM. Properti diakses dari kode dengan nama camelCase
// (dom.authBtn, dst), sedangkan id di HTML memakai kebab-case sesuai
// ketentuan penamaan — jembatannya ada di peta ini.
const ID_MAP = {
  "articleDetail": "article-detail",
  "authBtn": "auth-btn",
  "authEmail": "auth-email",
  "authError": "auth-error",
  "authForm": "auth-form",
  "authLabel": "auth-label",
  "authModal": "auth-modal",
  "authName": "auth-name",
  "authPass": "auth-pass",
  "authSubmit": "auth-submit",
  "authTitle": "auth-title",
  "authUser": "auth-user",
  "bookmarkCount": "bookmark-count",
  "bookmarkDesc": "bookmark-desc",
  "bookmarkGrid": "bookmark-grid",
  "bookmarkStatus": "bookmark-status",
  "catCrumbs": "cat-crumbs",
  "catDesc": "cat-desc",
  "catGrid": "cat-grid",
  "catSentinel": "cat-sentinel",
  "catStatus": "cat-status",
  "catTitle": "cat-title",
  "catTools": "cat-tools",
  "clearBookmarks": "clear-bookmarks",
  "confirmCancel": "confirm-cancel",
  "confirmIco": "confirm-ico",
  "confirmModal": "confirm-modal",
  "confirmOk": "confirm-ok",
  "confirmText": "confirm-text",
  "confirmTitle": "confirm-title",
  "emailField": "email-field",
  "errorDetail": "error-detail",
  "errorRetry": "error-retry",
  "errorText": "error-text",
  "errorTitle": "error-title",
  "footerCategories": "footer-categories",
  "footerNote": "footer-note",
  "footerYear": "footer-year",
  "guestBtn": "guest-btn",
  "headerDate": "header-date",
  "heroSection": "hero-section",
  "homeChips": "home-chips",
  "homeGrid": "home-grid",
  "homeSentinel": "home-sentinel",
  "homeStatus": "home-status",
  "homeTools": "home-tools",
  "konten-utama": "konten-utama",
  "logoutBtn": "logout-btn",
  "nameField": "name-field",
  "navList": "nav-list",
  "navToggle": "nav-toggle",
  "page404": "page404",
  "pageAbout": "page-about",
  "pageBookmark": "page-bookmark",
  "pageCategory": "page-category",
  "pageDetail": "page-detail",
  "pageError": "page-error",
  "pageHome": "page-home",
  "pageProfile": "page-profile",
  "pageSearch": "page-search",
  "pageTrending": "page-trending",
  "profileActions": "profile-actions",
  "profileBody": "profile-body",
  "profileCard": "profile-card",
  "profileGrid": "profile-grid",
  "profileStatus": "profile-status",
  "rankList": "rank-list",
  "searchChips": "search-chips",
  "searchClose": "search-close",
  "searchForm": "search-form",
  "searchGrid": "search-grid",
  "searchHint": "search-hint",
  "searchInput": "search-input",
  "searchPanel": "search-panel",
  "searchSentinel": "search-sentinel",
  "searchStatus": "search-status",
  "searchSuggest": "search-suggest",
  "searchSummary": "search-summary",
  "searchTitle": "search-title",
  "searchToggle": "search-toggle",
  "searchTools": "search-tools",
  "siteHeader": "site-header",
  "siteNav": "site-nav",
  "tabLogin": "tab-login",
  "tabRegister": "tab-register",
  "terbaruHeading": "terbaru-heading",
  "themeToggle": "theme-toggle",
  "toTop": "to-top",
  "toastWrap": "toast-wrap",
  "trendingCharts": "trending-charts",
  "trendingHeading": "trending-heading",
  "trendingPageCharts": "trending-page-charts"
};

Object.keys(ID_MAP).forEach((key) => {
  dom[key] = document.getElementById(ID_MAP[key]);
});
};

const PAGES = ["pageHome", "pageCategory", "pageDetail", "pageSearch", "pageBookmark",
  "pageProfile", "pageTrending", "page404", "pageError"];

// ALUR: TUKAR HALAMAN: set atribut hidden pada semua section kecuali yang dituju, lalu tutup menu mobile.
const showPage = (pageId) => {
  PAGES.forEach((id) => {
    const node = dom[id];
    if (node) node.hidden = id !== pageId;
  });
  document.body.classList.remove("nav-open");
  dom.siteNav.classList.remove("is-open");
  dom.navToggle.setAttribute("aria-expanded", "false");
};

/* ---------- BERANDA ---------- */

// ALUR: BLOK HERO BERANDA — urutkan berita terbaru; yang paling baru jadi kartu besar, 3 berikutnya jadi kartu samping.
const renderHero = (articles) => {
  if (!articles.length) {
    clearNode(dom.heroSection);
    return;
  }
  const sorted = sortNewest(articles);
  const main = sorted[0];
  const sides = sorted.slice(1, 4);

  const mainLink = el("a", { className: "hero-main", attrs: { href: detailUrl(main) } }, [
    articleImage(main, "thumb"),
    el("div", { className: "hero-body" }, [
      el("span", { className: "cat-label", text: CATEGORY_LABELS[main.category] || main.category }),
      el("h2", { text: main.title }),
      el("p", { text: truncate(main.description, 168) }),
      el("div", { className: "hero-meta" }, [
        el("span", { text: main.sourceName }),
        el("span", { text: timeAgo(main.publishedAt) }),
        el("span", { className: "stat-inline" }, [icon("eye", "ico-sm"), formatNumber(main.totalViews || main.views) + " dibaca"])
      ])
    ])
  ]);

  const sideCards = sides.map((item) => el("a", {
    className: "side-card",
    attrs: { href: detailUrl(item) }
  }, [
    articleImage(item, "thumb"),
    el("div", { className: "side-body" }, [
      el("h3", { text: item.title }),
      el("div", { className: "side-meta" }, [
        el("span", { text: CATEGORY_LABELS[item.category] || item.category }),
        el("span", { className: "meta-dot", text: "•" }),
        el("span", { text: timeAgo(item.publishedAt) })
      ])
    ])
  ]));

  fillNode(dom.heroSection, [mainLink, el("div", { className: "hero-side" }, sideCards)]);
};

// ALUR: blok trending di beranda: buat panel grafik batang (berita terpopuler) + panel cincin (sebaran kategori).
const renderTrendingBlock = () => {
  const ranked = rankByViews(state.articles, CONFIG.chartTopN);
  const byCategory = viewsByCategory(state.articles);
  fillNode(dom.trendingCharts, [
    createBarChartPanel(ranked),
    createDonutPanel(byCategory)
  ]);
};

/** Deretan chip kategori untuk filter di beranda. */
const renderHomeChips = () => {
  const chips = [el("button", {
    className: "chip" + (state.feeds.home && state.feeds.home.category === "semua" ? " is-active" : ""),
    attrs: { type: "button", "data-category": "semua" },
    text: "Semua"
  })];

  CATEGORY_LABELS && CATEGORIES.forEach((cat) => {
    const count = state.articles.filter((item) => item.category === cat.slug).length;
    const active = state.feeds.home && state.feeds.home.category === cat.slug;
    chips.push(el("button", {
      className: "chip" + (active ? " is-active" : ""),
      attrs: { type: "button", "data-category": cat.slug },
      text: cat.label + " (" + count + ")"
    }));
  });

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const category = chip.getAttribute("data-category");
      resetFeed("home", { category });
      renderHomeChips();
      renderFeedPage("home");
    });
  });

  fillNode(dom.homeChips, chips);
};

/* ---------- FEED + INFINITE SCROLL ---------- */

// ALUR: pabrik objek status 1 feed/umpan: kategori aktif, kata kunci, halaman saat ini, flag pemuatan/selesai, mode muat.
const createFeed = (key) => ({
  key,
  category: "semua",
  query: "",
  page: 1,
  loading: false,
  done: false,
  mode: state.feedMode
});

// ALUR: ALUR PENYARINGAN DAFTAR BERITA:
// 1) menyalin semua artikel di state,
// 2) menyaaring sesuai kategori (selain 'semua'),
// 3) bila ada kata kunci → cari (searchArticles); bila tidak → urutkan dari yang terbaru.
const getFeedItems = (feed) => {
  let items = state.articles.slice();
  if (feed.category && feed.category !== "semua") items = filterByCategory(items, feed.category);
  if (feed.query) items = searchArticles(items, feed.query);
  else items = sortNewest(items);
  return items;
};

// ALUR: peta 'di mana elemen tiap feed berada': grid (tempat kartu), status (pesan), sentinel (infinite gulir),
// dan tools (panel alat). Feed 'bookmark' tidak punya sentinel & tools.
const feedTargets = {
  home: { grid: () => dom.homeGrid, status: () => dom.homeStatus, sentinel: () => dom.homeSentinel, tools: () => dom.homeTools },
  category: { grid: () => dom.catGrid, status: () => dom.catStatus, sentinel: () => dom.catSentinel, tools: () => dom.catTools },
  search: { grid: () => dom.searchGrid, status: () => dom.searchStatus, sentinel: () => dom.searchSentinel, tools: () => dom.searchTools },
  // halaman Berita Tersimpan hanya punya grid + status (tanpa infinite gulir / panel alat)
  bookmark: { grid: () => dom.bookmarkGrid, status: () => dom.bookmarkStatus, sentinel: () => null, tools: () => null }
};

const resetFeed = (key, options) => {
  const opts = options || {};
  const feed = state.feeds[key] || createFeed(key);
  feed.category = opts.category !== undefined ? opts.category : feed.category;
  feed.query = opts.query !== undefined ? opts.query : feed.query;
  feed.page = 1;
  feed.loading = false;
  feed.done = false;
  state.feeds[key] = feed;
};

const renderFeedStatus = (key, message, options) => {
  const target = feedTargets[key];
  if (!target) return;
  const statusNode = target.status();
  if (!statusNode) return;
  clearNode(statusNode);
  if (!message) return;
  const opts = options || {};
  if (opts.spinner) statusNode.appendChild(el("span", { className: "spinner", attrs: { "aria-hidden": "true" } }));
  statusNode.appendChild(el("span", { text: message }));
};

// ALUR: ubah tiap artikel menjadi elemen kartu (createCard) lalu tempelkan ke grid feed terkait.
const appendFeedItems = (key, items) => {
  const grid = feedTargets[key].grid();
  items.forEach((item) => grid.appendChild(createCard(item)));
};

/** Render satu "halaman" data berikutnya untuk sebuah feed. */
const loadMoreFeed = async (key) => {
  const feed = state.feeds[key];
  // ALUR: pengaman — jangan memuat ganda saat sedang pemuatan, dan berhenti jika data sudah habis.
  if (!feed || feed.loading || feed.done) return;
  if (feed.mode === "pages") {
    await renderSinglePage(key, feed.page);
    return;
  }
  feed.loading = true;
  renderFeedStatus(key, "Memuat berita berikutnya…", { spinner: true });

  await delay(380);

  const items = getFeedItems(feed);
  // ALUR: potong data sampai 'halaman' saat ini (pageSize kartu per halaman).
  const result = paginate(items, feed.page, CONFIG.pageSize);

  // Halaman 1: grid dikosongkan dulu agar kartu lama tidak tercampur.
  if (feed.page === 1) clearNode(feedTargets[key].grid());
  appendFeedItems(key, result.items.slice((feed.page - 1) * CONFIG.pageSize));

  if (!result.hasMore) {
    feed.done = true;
    if (!result.total) {
      renderFeedStatus(key, "");
      renderEmptyState(feedTargets[key].grid(), key === "search"
        ? "Tidak ada berita yang cocok dengan pencarianmu."
        : "Belum ada berita pada bagian ini.");
    } else {
      renderFeedStatus(key, "Kamu sudah melihat semua " + result.total + " berita.");
    }
  } else {
    // Naikkan nomor halaman untuk panggilan observer berikutnya.
    feed.page += 1;
    renderFeedStatus(key, "");
  }
  feed.loading = false;
};

/* ---------- MODE PAGINATION (nomor halaman) ---------- */

/** Menampilkan hanya potongan data pada halaman tertentu. */
const renderSinglePage = async (key, page) => {
  const feed = state.feeds[key];
  if (!feed) return;

  const items = getFeedItems(feed);
  // Hitung jumlah total halaman dari jumlah item.
  const totalPages = Math.max(1, Math.ceil(items.length / CONFIG.pageSize));
  // Koreksi nomor halaman agar tidak kurang dari 1 / lebih dari total.
  const safePage = Math.min(Math.max(1, page), totalPages);
  feed.page = safePage;

  renderFeedStatus(key, "Memuat halaman " + safePage + "…", { spinner: true });
  await delay(260);

  const start = (safePage - 1) * CONFIG.pageSize;
  const potongan = items.slice(start, start + CONFIG.pageSize);

  clearNode(feedTargets[key].grid());
  if (!potongan.length) {
    renderFeedStatus(key, "");
    renderEmptyState(feedTargets[key].grid(), key === "search"
      ? "Tidak ada berita yang cocok dengan pencarianmu."
      : "Belum ada berita pada bagian ini.");
  } else {
    appendFeedItems(key, potongan);
    renderFeedStatus(key, "Halaman " + safePage + " dari " + totalPages +
      " — menampilkan " + potongan.length + " dari " + formatNumber(items.length) + " berita.");
  }

  renderFeedTools(key, totalPages);
  feed.done = false;
  feed.loading = false;
};

/** Tombol pindah halaman: awal, sebelum, nomor, sesudah, akhir. */
const goToPage = (key, page) => {
  const feed = state.feeds[key];
  if (!feed) return;
  renderSinglePage(key, page);
  const grid = feedTargets[key].grid();
  if (grid && grid.scrollIntoView) grid.scrollIntoView({ behavior: "smooth", block: "start" });
};

/**
 * Alat bantu feed: pemilih mode (gulir otomatis / nomor halaman)
 * dan deretan nomor halaman bila mode pagination aktif.
 */
const renderFeedTools = (key, totalPages) => {
  const holder = feedTargets[key].tools();
  if (!holder) return;
  const feed = state.feeds[key];
  clearNode(holder);

  const makeModeBtn = (mode, label) => {
    const button = el("button", {
      className: "chip" + (state.feedMode === mode ? " is-active" : ""),
      attrs: { type: "button", "data-mode": mode, "aria-pressed": String(state.feedMode === mode) },
      text: label
    });
    button.addEventListener("click", () => {
      // Tombol mode yang sudah aktif tidak melakukan apa-apa.
      if (state.feedMode === mode) return;
      state.feedMode = mode;
      writeStore(STORE_KEYS.feedMode, mode);
      Object.keys(state.feeds).forEach((feedKey) => {
        state.feeds[feedKey].mode = mode;
        state.feeds[feedKey].page = 1;
        state.feeds[feedKey].done = false;
        renderFeedPage(feedKey);
      });
      showToast(mode === "pages"
        ? "Mode halaman nomor diaktifkan."
        : "Mode gulir otomatis diaktifkan.", "success");
    });
    return button;
  };

  const modeBox = el("div", { className: "feed-mode", attrs: { role: "group", "aria-label": "Cara memuat berita" } }, [
    el("span", { className: "feed-mode-label", text: "Cara muat:" }),
    makeModeBtn("infinite", "Gulir otomatis"),
    makeModeBtn("pages", "Nomor halaman")
  ]);
  holder.appendChild(modeBox);

  if (state.feedMode !== "pages" || !feed) return;

  const pages = Math.max(1, totalPages || Math.ceil(getFeedItems(feed).length / CONFIG.pageSize));
  const buttons = [];

  const navBtn = (label, targetPage, disabled, ariaLabel) => {
    const button = el("button", {
      className: "page-btn",
      attrs: { type: "button", disabled: disabled || null, "aria-label": ariaLabel || label },
      text: label
    });
    if (!disabled) button.addEventListener("click", () => goToPage(key, targetPage));
    return button;
  };

  buttons.push(navBtn("‹", feed.page - 1, feed.page <= 1, "Halaman sebelumnya"));

  // nomor halaman: tampilkan maksimal 5 tombol di sekitar halaman aktif
  // Jendela nomor: tampilkan maksimal 5 tombol angka di sekitar halaman aktif.
  const startPage = Math.max(1, Math.min(feed.page - 2, pages - 4));
  const endPage = Math.min(pages, startPage + 4);
  for (let page = startPage; page <= endPage; page += 1) {
    const isActive = page === feed.page;
    const button = el("button", {
      className: "page-btn" + (isActive ? " is-active" : ""),
      attrs: {
        type: "button",
        "aria-current": isActive ? "page" : null,
        "aria-label": "Halaman " + page
      },
      text: String(page)
    });
    if (!isActive) button.addEventListener("click", () => goToPage(key, page));
    buttons.push(button);
  }

  buttons.push(navBtn("›", feed.page + 1, feed.page >= pages, "Halaman berikutnya"));

  holder.appendChild(el("nav", {
    className: "pagination",
    attrs: { "aria-label": "Navigasi halaman berita" }
  }, buttons));
};

// ALUR: DIPANGGIL SETIAP FEED DIMULAI ULANG (ganti chip/kategori/kata kunci):
// reset ke halaman 1 → kosongkan grid → tampilkan status & alat feed → mulai muat data.
const renderFeedPage = (key) => {
  const feed = state.feeds[key] || createFeed(key);
  feed.mode = state.feedMode;
  state.feeds[key] = feed;
  clearNode(feedTargets[key].grid());
  feed.page = 1;
  feed.done = false;
  feed.loading = false;
  renderFeedStatus(key, "Memuat berita…", { spinner: true });
  renderFeedTools(key);
  loadMoreFeed(key);
};

/** Menampilkan kerangka sebanyak n kartu. */
const renderSkeletonFeed = (key, count) => {
  const grid = feedTargets[key].grid();
  fillNode(grid, Array.from({ length: count || CONFIG.pageSize }, () => createCardSkeleton()));
  renderFeedStatus(key, "Mengambil data berita…", { spinner: true });
};

// ALUR: tampilkan kotak 'belum ada data' (ilustrasi + pesan + tombol kembali) di kontainer yang diberikan.
const renderEmptyState = (container, message) => {
  fillNode(container, [
    el("div", { className: "state-box state-empty", attrs: { role: "status" } }, [
      el("div", { className: "state-ico" }, el("img", { className: "state-ill", attrs: { src: BASE + "assets/ilustrasi/kosong.png", alt: "" } })),
      el("p", { className: "state-title", text: "Belum ada yang bisa ditampilkan" }),
      el("p", { className: "state-text", text: message }),
      el("div", { className: "state-actions" }, [
        el("a", { className: "btn btn-primary", attrs: { href: routeUrl("#/beranda") }, text: "Kembali ke Beranda" })
      ])
    ])
  ]);
};

/* ---------- DETAIL BERITA ---------- */

// ALUR: cari satu artikel di state.articles berdasarkan id; kembalikan null bila tidak ditemukan.
const findArticleById = (id) => state.articles.find((item) => String(item.id) === String(id)) || null;

// ALUR: ambil id berita dari bagian URL '#/berita/12-judul-berita' → hasilnya '12' (slug setelahnya diabaikan).
const parseArticleId = (hashPart) => {
  const decoded = decodeURIComponent(hashPart || "");
  const match = decoded.match(/^(\d+|-)/) || decoded.match(/^([^-]+)/);
  return match ? match[1] : decoded;
};

// ALUR: SUSUN HALAMAN DETAIL (semua elemen dibuat di sini):
// tombol kembali → pil kategori (tautan ke halaman kategori) → judul → ringkasan →
// meta penulis/sumber/tanggal/waktu baca/jumlah dibaca → gambar besar →
// isi berita (paragraf biasa, '## ' jadi subjudul, '> ' jadi kutipan) → tagar →
// tombol simpan & bagikan → 3 berita terkait (kategori sama, pembaca terbanyak).
const renderDetail = (article) => {
  const container = dom.articleDetail;
  clearNode(container);

  const backButton = el("a", { className: "detail-back", attrs: { href: "javascript:history.back()" } }, [
    icon("back", "ico-sm"), "Kembali"
  ]);
  backButton.addEventListener("click", (event) => {
    event.preventDefault();
    if (window.history.length > 1) window.history.back();
    else window.location.href = routeUrl("#/beranda");
  });

  const catLink = el("a", {
    className: "detail-cat",
    attrs: { href: categoryUrl(article.category) },
    text: CATEGORY_LABELS[article.category] || article.category
  });

  const hero = el("figure", { className: "detail-hero" }, [
    articleImage(article, ""),
    el("figcaption", { className: "detail-caption", text: "Ilustrasi: " + article.title })
  ]);
  const heroImg = hero.querySelector("img");
  heroImg.style.aspectRatio = "16 / 9";
  heroImg.style.objectFit = "cover";

  const body = el("div", { className: "detail-body" });
  article.paragraphs.forEach((paragraph) => {
    if (paragraph.startsWith("## ")) {
      body.appendChild(el("h3", { text: paragraph.slice(3) }));
    } else if (paragraph.startsWith("> ")) {
      body.appendChild(el("blockquote", { text: paragraph.slice(2) }));
    } else {
      body.appendChild(el("p", { text: paragraph }));
    }
  });

  const tags = (article.tags || []).map((tag) => el("a", {
    className: "tag-pill",
    attrs: { href: routeUrl("#/cari?q=" + encodeURIComponent(tag)) },
    text: "#" + tag
  }));

  const saveBtn = el("button", {
    className: "btn " + (isBookmarked(article.id) ? "btn-primary" : "btn-ghost"),
    attrs: { type: "button" }
  }, [icon("bookmark", "ico-sm"), el("span", { text: isBookmarked(article.id) ? "Tersimpan" : "Simpan berita" })]);
  saveBtn.addEventListener("click", () => {
    toggleBookmark(article.id);
    renderDetail(findArticleById(article.id) || article);
  });

  const shareBtn = el("button", { className: "btn btn-ghost", attrs: { type: "button" } }, [
    icon("share", "ico-sm"), el("span", { text: "Bagikan" })
  ]);
  shareBtn.addEventListener("click", () => openShare(article));

  const related = state.articles
    .filter((item) => item.category === article.category && String(item.id) !== String(article.id))
    .sort((a, b) => (b.totalViews || b.views) - (a.totalViews || a.views))
    .slice(0, 3);

  fillNode(container, [
    backButton,
    catLink,
    el("h1", { className: "detail-title", text: article.title }),
    el("p", { className: "detail-lead", text: article.description }),
    el("div", { className: "detail-meta" }, [
      el("span", {}, [el("b", { text: article.author })]),
      el("span", { text: article.sourceName }),
      el("span", { text: formatDateId(article.publishedAt) }),
      el("span", { className: "stat-inline" }, [icon("clock", "ico-sm"), readingTime(article) + " menit baca"]),
      el("span", { className: "stat-inline" }, [icon("eye", "ico-sm"), formatNumber(article.totalViews || article.views) + " kali dibaca"])
    ]),
    hero,
    body,
    tags.length ? el("div", { className: "detail-tags" }, tags) : null,
    el("div", { className: "detail-actions" }, [
      saveBtn,
      shareBtn,
      el("div", { className: "share-row", attrs: { id: "share-row-inline" } }, buildShareButtons(article))
    ]),
    related.length ? el("h2", { className: "related-title", text: "Berita terkait" }) : null,
    related.length ? el("div", { className: "article-grid" }, related.map((item) => createCard(item))) : null
  ]);
};

/* ---------- PENCARIAN ---------- */

// ALUR: SIAPKAN HALAMAN CARI: simpan kata kunci → hitung & tampilkan jumlah hasil → buat chip saringan per kategori.
const renderSearchPage = (query) => {
  state.query = query;
  const feed = state.feeds.search || createFeed("search");
  state.feeds.search = feed;

  dom.searchTitle.textContent = query ? "Hasil pencarian: “" + query + "”" : "Pencarian Berita";

  const results = searchArticles(state.articles, query);
  dom.searchSummary.textContent = query
    ? "Ditemukan " + formatNumber(results.length) + " berita untuk kata kunci “" + query + "”."
    : "Ketik kata kunci untuk mencari dari " + formatNumber(state.articles.length) + " berita yang tersedia.";

  // Hitung jumlah berita per kategori untuk label chip ('Ekonomi (7)').
  const cats = state.articles.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {});

  const chips = [el("button", {
    className: "chip" + (feed.category === "semua" ? " is-active" : ""),
    attrs: { type: "button", "data-category": "semua" },
    text: "Semua kategori"
  })];
  Object.keys(cats).sort().forEach((slug) => {
    chips.push(el("button", {
      className: "chip" + (feed.category === slug ? " is-active" : ""),
      attrs: { type: "button", "data-category": slug },
      text: (CATEGORY_LABELS[slug] || slug) + " (" + cats[slug] + ")"
    }));
  });
  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      feed.category = chip.getAttribute("data-category");
      renderSearchPage(state.query);
      renderFeedPage("search");
    });
  });
  fillNode(dom.searchChips, chips);
};

/* ---------- BOOKMARK ---------- */

// ALUR: HALAMAN TERSIMPAN: filter artikel yang id-nya ada di state.bookmarks, urut sesuai urutan penyimpanan;
// bila kosong tampilkan kotak ajakan (empty state).
const renderBookmarkPage = () => {
  const items = state.articles
    .filter((item) => isBookmarked(item.id))
    .sort((a, b) => (state.bookmarks.indexOf(String(b.id)) - state.bookmarks.indexOf(String(a.id))));

  dom.bookmarkDesc.textContent = items.length
    ? "Kamu menyimpan " + items.length + " berita. Tersimpan di perangkat ini" +
      (state.user ? " untuk akun " + state.user.name + "." : " sebagai tamu.")
    : "Belum ada berita yang disimpan." + (state.user ? "" : " Kamu juga bisa masuk agar simpanan tidak hilang saat menghapus data browser.");

  clearNode(dom.bookmarkGrid);
  if (!items.length) {
    renderEmptyState(dom.bookmarkGrid, "Tekan ikon penanda pada kartu berita untuk menyimpannya di sini.");
    renderFeedStatus("bookmark", "");
    return;
  }
  items.forEach((item) => dom.bookmarkGrid.appendChild(createCard(item)));
  renderFeedStatus("bookmark", "");
};

/* ---------- PROFIL PENGGUNA ---------- */

/** Menanyakan konfirmasi keluar (dipakai tombol keluar di mana pun). */
const mintaKonfirmasiKeluar = () => {
  openConfirm({
    title: "Keluar dari akun?",
    text: state.user
      ? "Kamu akan keluar dari akun " + state.user.name + ". Berita yang kamu simpan tetap aman dan bisa dibuka lagi setelah masuk."
      : "Kamu akan keluar dari akun ini.",
    okLabel: "Ya, Keluar",
    onConfirm: logout
  });
};

/**
 * Halaman profil: kartu data pendaftaran + statistik + daftar berita
 * yang disimpan pengguna tersebut.
 */
const renderProfilePage = () => {
  // Belum masuk -> tawarkan untuk masuk
  if (!state.user) {
    dom.profileBody.hidden = true;
    fillNode(dom.profileCard, [
      el("div", { className: "state-box state-empty profile-guest" }, [
        el("div", { className: "state-ico" }, icon("user", "ico-lg")),
        el("h2", { className: "state-title", text: "Kamu belum masuk" }),
        el("p", { className: "state-text", text: "Masuk atau daftar dulu untuk melihat profil dan berita yang kamu simpan." }),
        el("div", { className: "state-actions" }, [
          (() => {
            const tombol = el("button", { className: "btn btn-primary", attrs: { type: "button" }, text: "Masuk / Daftar" });
            tombol.addEventListener("click", () => openAuthModal("login"));
            return tombol;
          })()
        ])
      ])
    ]);
    return;
  }

  const user = state.user;
  const jumlahSimpan = state.bookmarks.length;
  const jumlahBaca = readCount();

  const barisData = (label, nilai) => el("div", { className: "profile-row" }, [
    el("span", { className: "profile-row-label", text: label }),
    el("span", { className: "profile-row-value", text: nilai || "—" })
  ]);

  // teks saja, tanpa ikon
  const tombolKeluar = el("button", { className: "btn btn-ghost btn-danger-outline", attrs: { type: "button" } }, [
    el("span", { text: "Keluar" })
  ]);
  tombolKeluar.addEventListener("click", mintaKonfirmasiKeluar);

  fillNode(dom.profileCard, [
    el("div", { className: "profile-head" }, [
      el("div", { className: "avatar", attrs: { "aria-hidden": "true" }, text: initials(user.name) }),
      el("div", { className: "profile-id" }, [
        el("h1", { className: "profile-name", text: user.name }),
        el("p", { className: "profile-handle", text: "@" + user.username }),
        el("p", { className: "profile-mail", text: user.email || "Email belum diisi" })
      ]),
      el("div", { className: "profile-tools" }, [tombolKeluar])
    ]),
    el("dl", { className: "profile-stats" }, [
      el("div", { className: "profile-stat" }, [
        el("dt", { text: "Berita tersimpan" }),
        el("dd", { text: formatNumber(jumlahSimpan) })
      ]),
      el("div", { className: "profile-stat" }, [
        el("dt", { text: "Berita dibaca" }),
        el("dd", { text: formatNumber(jumlahBaca) })
      ]),
      el("div", { className: "profile-stat" }, [
        el("dt", { text: "Terdaftar sejak" }),
        el("dd", { text: user.createdAt ? formatDateId(user.createdAt) : "—" })
      ])
    ]),
    el("div", { className: "profile-detail" }, [
      barisData("Nama lengkap", user.name),
      barisData("Username", user.username),
      barisData("Email", user.email),
      barisData("Tanggal daftar", user.createdAt ? formatDateId(user.createdAt) : null)
    ])
  ]);

  // daftar berita tersimpan milik pengguna ini
  dom.profileBody.hidden = false;

  const items = state.articles
    .filter((item) => isBookmarked(item.id))
    .sort((a, b) => state.bookmarks.indexOf(String(b.id)) - state.bookmarks.indexOf(String(a.id)));

  const hapusSemua = el("button", { className: "chip", attrs: { type: "button" }, text: "Hapus semua" });
  hapusSemua.addEventListener("click", () => {
    if (!state.bookmarks.length) {
      showToast("Daftar tersimpanmu masih kosong.", "warn");
      return;
    }
    openConfirm({
      title: "Hapus semua berita tersimpan?",
      text: "Sebanyak " + state.bookmarks.length + " berita akan dihapus dari daftar simpananmu. Tindakan ini tidak bisa dibatalkan.",
      okLabel: "Ya, Hapus",
      onConfirm: () => {
        state.bookmarks = [];
        saveBookmarks();
        syncBookmarkButtons();
        renderProfilePage();
        showToast("Semua berita tersimpan sudah dihapus.", "warn");
      }
    });
  });

  const lihatTersimpan = el("a", {
    className: "chip",
    attrs: { href: routeUrl("#/tersimpan") },
    text: "Buka halaman Berita Tersimpan"
  });
  fillNode(dom.profileActions, [lihatTersimpan, hapusSemua]);

  clearNode(dom.profileGrid);
  if (!items.length) {
    renderEmptyState(dom.profileGrid, "Kamu belum menyimpan berita. Tekan ikon penanda pada kartu berita untuk menyimpannya di sini.");
  } else {
    items.forEach((item) => dom.profileGrid.appendChild(createCard(item)));
  }

  dom.profileStatus.textContent = items.length
    ? items.length + " berita tersimpan untuk akun " + user.name + "."
    : "";
};

/* ---------- TRENDING ---------- */

// ALUR: PAPAN TRENDING: gambar dua grafik (batang + cincin) di atas, lalu 10 baris peringatan berita terpopuler;
// tiap baris adalah tautan menuju detail.
const renderTrendingPage = () => {
  const ranked = rankByViews(state.articles, CONFIG.chartTopN);
  const byCategory = viewsByCategory(state.articles);
  fillNode(dom.trendingPageCharts, [createBarChartPanel(ranked), createDonutPanel(byCategory)]);

  const list = rankByViews(state.articles, CONFIG.rankTopN);
  const rows = list.map((item, index) => {
    const link = el("a", {
      className: "rank-item",
      attrs: { href: detailUrl(item) }
    }, [
      el("span", { className: "rank-index", text: String(index + 1) }),
      el("div", { className: "rank-info" }, [
        el("div", { className: "rank-title", text: item.title }),
        el("div", { className: "rank-sub", text: (CATEGORY_LABELS[item.category] || item.category) + " • " + item.sourceName + " • " + timeAgo(item.publishedAt) })
      ]),
      el("div", { className: "rank-views" }, [
        el("b", { text: formatNumber(item.totalViews || item.views) }),
        el("span", { text: "pembaca" })
      ])
    ]);
    return link;
  });
  fillNode(dom.rankList, rows);
};

/* ---------- HALAMAN ERROR ---------- */

// ALUR: UBAH OBJEK ERROR JADI TAMPILAN: judul pesan, saran tindakan, detail teknis (kode/sumber/waktu),
// pilih ilustrasi offline vs error, lalu tampilkan halaman error.
const renderError = (error) => {
  const info = error || makeError("UNKNOWN", "Terjadi kesalahan yang tidak dikenal.");
  state.error = info;

  dom.errorTitle.textContent = info.message;
  dom.errorText.textContent = info.hint || "Portal tidak dapat menampilkan berita saat ini. Silakan coba lagi beberapa saat atau kembali ke beranda.";

  const details = [
    "Kode kesalahan: " + info.code,
    "Sumber data: " + (state.meta && state.meta.source ? state.meta.source : "belum tersedia"),
    "Waktu kejadian: " + formatDateId(new Date().toISOString())
  ];
  fillNode(dom.errorDetail, details.map((text) => el("li", { text })));

  const icoBox = dom.pageError ? dom.pageError.querySelector(".state-ico") : null;
  if (icoBox) {
    const berkas = (info.code === "NETWORK" || info.code === "OFFLINE")
      ? "assets/ilustrasi/offline.png" : "assets/ilustrasi/error.png";
    fillNode(icoBox, [el("img", { className: "state-ill", attrs: { src: BASE + berkas, alt: "" } })]);
  }

  showPage("pageError");
};

/* 
 H. CHART SVG (TRENDING)
*/

// ALUR: BANGUN GRAFIK BATANG:
// 1) hitung geometri tiap baris (barChartGeometry): posisi & lebar batang proporsional nilai,
// 2) gambar garis sumbu, 3) tiap baris: label kiri, jalur latar, batang berwarna, angka pembaca,
// 4) batang dibuat fokus-able & bisa tekan/Enter untuk membuka beritanya.
const createBarChartPanel = (ranked) => {
  const rows = ranked.map((item, index) => ({
    id: item.id,
    slug: item.slug,
    label: truncate(item.title, 34),
    fullLabel: item.title,
    value: Number(item.totalViews || item.views) || 0,
    color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
    category: item.category
  }));

  const panel = el("div", { className: "panel" }, [
    el("h3", { className: "panel-title", text: "Berita paling banyak dibaca" }),
    el("p", { className: "panel-sub", text: "Jumlah pembaca " + CONFIG.chartTopN + " berita teratas. Klik batang untuk membuka beritanya." })
  ]);

  const box = el("div", { className: "chart-box" });
  panel.appendChild(box);

  if (!rows.length) {
    panel.appendChild(el("p", { className: "chart-caption", text: "Belum ada data kunjungan." }));
    return panel;
  }

  const geo = barChartGeometry(rows, { width: 620, labelWidth: 172, rowHeight: 36, barHeight: 17, valueWidth: 70 });
  const svg = svgEl("svg", {
    class: "chart-svg",
    viewBox: "0 0 " + geo.width + " " + geo.height,
    role: "img",
    "aria-label": "Grafik batang jumlah pembaca berita terpopuler"
  });

  // garis sumbu vertikal
  svg.appendChild(svgEl("line", {
    class: "axis-line",
    x1: geo.labelWidth,
    y1: 2,
    x2: geo.labelWidth,
    y2: geo.height - 4
  }));

  geo.rows.forEach((row) => {
    const title = svgEl("title");
    title.appendChild(document.createTextNode(row.fullLabel + " — " + formatNumber(row.value) + " pembaca"));

    const group = svgEl("g", { class: "bar" }, [
      title,
      svgEl("text", { class: "bar-label", x: 0, y: row.barY + row.height / 2 + 4 }, [
        (() => {
          const textNode = svgEl("tspan");
          textNode.appendChild(document.createTextNode(row.label));
          return textNode;
        })()
      ]),
      svgEl("rect", {
        x: geo.labelWidth,
        y: row.barY,
        width: geo.barArea,
        height: row.height,
        rx: 4,
        fill: "currentColor",
        opacity: "0.12"
      }),
      svgEl("rect", {
        x: geo.labelWidth,
        y: row.barY,
        width: row.barWidth,
        height: row.height,
        rx: 4,
        fill: row.color
      }),
      svgEl("text", {
        class: "bar-value",
        x: geo.labelWidth + geo.barArea + 10,
        y: row.barY + row.height / 2 + 4
      }, [
        (() => {
          const textNode = svgEl("tspan");
          textNode.appendChild(document.createTextNode(formatCompact(row.value)));
          return textNode;
        })()
      ])
    ]);

    group.addEventListener("click", () => {
      window.location.href = detailUrl({ id: row.id, slug: row.slug });
    });
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        window.location.href = detailUrl({ id: row.id, slug: row.slug });
      }
    });
    group.setAttribute("tabindex", "0");
    group.setAttribute("role", "button");

    svg.appendChild(group);
  });

  box.appendChild(svg);

  panel.appendChild(el("p", { className: "chart-caption", text: "Total pembaca dihitung dari data kunjungan tiap berita dan bertambah setiap kali berita dibuka." }));
  return panel;
};

// ALUR: BANGUN GRAFIK CINCIN (donut): tiap kategori satu lingkaran dengan stroke-dasharray sebesar persentasenya;
// total pembaca ditulis di tengah, legenda warna di bawah; tekan potongan → halaman kategori terkait.
const createDonutPanel = (byCategory) => {
  const rows = byCategory.slice(0, CATEGORY_COLORS.length).map((item, index) => ({
    // slug: item.slug,
    // label: item.label,
    // value: item.views,
    // color: CATEGORY_COLORS[index % CATEGORY_COLORS.length]
  }));

  const panel = el("div", { className: "panel" }, [
    // el("h3", { className: "panel-title", text: "Sebaran pembaca per kategori" }),
    // el("p", { className: "panel-sub", text: "Porsi jumlah pembaca dari tiap kategori berita." })
  ]);

  if (!rows.length) {
    panel.appendChild(el("p", { className: "chart-caption", text: "Belum ada data kategori." }));
    return panel;
  }

  const geo = donutChartGeometry(rows, { size: 216, radius: 76, stroke: 28 });
  const svg = svgEl("svg", {
    // class: "chart-svg",
    // viewBox: "0 0 " + geo.size + " " + geo.size,
    // role: "img",
    // "aria-label": "Grafik cincin sebaran pembaca per kategori"
  });

  const center = geo.size / 2;
  svg.appendChild(svgEl("circle", {
    cx: center, cy: center, r: geo.radius,
    fill: "none", stroke: "currentColor", "stroke-width": geo.stroke, opacity: "0.08"
  }));

  geo.rows.forEach((row) => {
    const title = svgEl("title");
    title.appendChild(document.createTextNode(row.label + " — " + formatNumber(row.value) + " pembaca (" + row.percent + "%)"));

    const circle = svgEl("circle", {
      // class: "slice",
      // cx: center,
      // cy: center,
      // r: geo.radius,
      // fill: "none",
      // stroke: row.color,
      // "stroke-width": geo.stroke,
      // "stroke-dasharray": row.dash + " " + row.gap,
      // "stroke-dashoffset": row.dashOffset,
      // transform: "rotate(-90 " + center + " " + center + ")"
    }, [title]);

    circle.addEventListener("click", () => {
      // window.location.href = categoryUrl(row.slug);
    });
    // svg.appendChild(circle);
  });

  const totalLabel = svgEl("text", {
    // class: "bar-value",
    // x: center,
    // y: center - 2,
    // "text-anchor": "middle",
    // "font-size": "16"
  }, [document.createTextNode(formatCompact(geo.total))]);
  const subLabel = svgEl("text", {
    // class: "axis-label",
    // x: center,
    // y: center + 16,
    // "text-anchor": "middle"
  }, [document.createTextNode("total pembaca")]);
  // svg.appendChild(totalLabel);
  // svg.appendChild(subLabel);

  const box = el("div", { className: "chart-box" }, svg);
  // panel.appendChild(box);

  const legend = el("div", { className: "legend" });
  // geo.rows.forEach((row) => {
  //   legend.appendChild(el("span", { className: "legend-item" }, [
      // el("span", { className: "legend-dot", attrs: { style: "background:" + row.color } }),
      // el("span", { text: row.label + " (" + row.percent + "%)" })
  //   ]));
  // });
  panel.appendChild(legend);

  return panel;
};

/* 
 I. BOOKMARK, AUTENTIKASI, SHARE, TOAST
*/

// ALUR: NOTIFIKASI SINGKAT (toast) pojok kanan bawah: buat elemen toast sesuai jenis (info/sukses/peringatan/error),
// pasang tombol tutup, lalu otomatis hilang setelah CONFIG.toastDuration milidetik.
const showToast = (message, type) => {
  if (!dom.toastWrap) return;
  const toast = el("div", { className: "toast" + (type === "error" ? " toast-error" : type === "warn" ? " toast-warn" : "") }, [
    el("span", { className: "toast-text", text: message }),
    el("button", { className: "toast-close", attrs: { type: "button", "aria-label": "Tutup notifikasi" }, text: "×" })
  ]);
  const close = () => {
    toast.classList.add("is-out");
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 240);
  };
  toast.querySelector(".toast-close").addEventListener("click", close);
  dom.toastWrap.appendChild(toast);
  setTimeout(close, CONFIG.toastDuration);
};

/* ---------- MODAL KONFIRMASI ---------- */

// ALUR: menampung fungsi yang akan dijalankan saat tombol 'Ya' pada modal konfirmasi ditekan (dipakai logout & hapus bookmark).
let confirmAction = null;

/**
 * Menampilkan modal konfirmasi.
 * @param {Object} opsi - { title, text, okLabel, onConfirm }
 */
const openConfirm = (opsi) => {
  if (!dom.confirmModal) return;
  const opts = opsi || {};

  dom.confirmTitle.textContent = opts.title || "Yakin?";
  dom.confirmText.textContent = opts.text || "";
  dom.confirmOk.textContent = opts.okLabel || "Ya, Lanjutkan";
  confirmAction = typeof opts.onConfirm === "function" ? opts.onConfirm : null;

  dom.confirmModal.hidden = false;
  setTimeout(() => dom.confirmOk.focus(), 60);
};

const closeConfirm = () => {
  if (!dom.confirmModal) return;
  dom.confirmModal.hidden = true;
  confirmAction = null;
};

/** Inisial nama untuk avatar, contoh: "Budi Santoso" -> "BS" */
const initials = (name) => String(name || "?")
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((word) => word[0].toUpperCase())
  .join("") || "?";

// ALUR: kunci penyimpanan sesuai status: 'guest' untuk tamu, 'u:<username>' untuk yang sudah masuk → data tiap akun terpisah.
const bookmarkKey = () => state.user ? "u:" + state.user.username : "guest";

/**
 * Jumlah berita yang pernah dibuka PENGGUNA INI.
 * Riwayat dibaca dipisah per akun di STORE_KEYS.read, bukan diambil dari
 * STORE_KEYS.views yang bersifat global untuk trending. Kalau diambil dari
 * sana, semua akun akan melihat angka yang sama.
 */
const readCount = () => state.reads.length;

/** Memuat riwayat baca milik akun aktif (atau milik tamu bila belum masuk). */
const loadReads = () => {
  const all = readStore(STORE_KEYS.read, {});
  const key = bookmarkKey();
  state.reads = Array.isArray(all[key]) ? all[key].slice() : [];
};

const saveReads = () => {
  const all = readStore(STORE_KEYS.read, {});
  all[bookmarkKey()] = state.reads;
  writeStore(STORE_KEYS.read, all);
};

/** Menandai satu berita sudah dibaca oleh akun aktif (tanpa menghitung dobel). */
const markRead = (id) => {
  const key = String(id);
  if (state.reads.indexOf(key) !== -1) return;
  state.reads.push(key);
  saveReads();
};

// ALUR: baca daftar berita tersimpan milik akun/tamu aktif dari localStorage lalu segarkan lencana jumlah.
const loadBookmarks = () => {
  const all = readStore(STORE_KEYS.bookmarks, {});
  state.bookmarks = Array.isArray(all[bookmarkKey()]) ? all[bookmarkKey()] : [];
  updateBookmarkBadge();
};

// ALUR: simpan daftar bookmark aktif ke localStorage (data akun lain tetap utuh) lalu segarkan lencana.
const saveBookmarks = () => {
  const all = readStore(STORE_KEYS.bookmarks, {});
  all[bookmarkKey()] = state.bookmarks;
  writeStore(STORE_KEYS.bookmarks, all);
  updateBookmarkBadge();
};

// ALUR: tampilkan lencana angka jumlah tersimpan di header; sembunyikan bila 0.
const updateBookmarkBadge = () => {
  if (!dom.bookmarkCount) return;
  const count = state.bookmarks.length;
  dom.bookmarkCount.hidden = count === 0;
  dom.bookmarkCount.textContent = String(count);
};

// ALUR: SIMPAN / HAPUS BOOKMARK:
// - tamu (belum masuk) → tampilkan peringatan & buka modal login,
// - id belum ada → tambahkan + toast sukses; sudah ada → hapus + toast peringatan,
// - lalu simpan, samakan ikon semua tombol, dan segarkan halaman tersimpan bila sedang terbuka.
const toggleBookmark = (id) => {
  if (!state.user) {
    showToast("Masuk atau daftar dulu untuk menyimpan berita.", "warn");
    openAuthModal("login");
    return;
  }

  const key = String(id);
  const index = state.bookmarks.indexOf(key);
  if (index === -1) {
    state.bookmarks.push(key);
    showToast("Berita disimpan ke daftar baca nanti.", "success");
  } else {
    state.bookmarks.splice(index, 1);
    showToast("Berita dihapus dari daftar tersimpan.", "warn");
  }
  saveBookmarks();
  syncBookmarkButtons();
  if (dom.pageBookmark && !dom.pageBookmark.hidden) renderBookmarkPage();
};

/** Menyamakan status tombol simpan di seluruh kartu yang tampil. */
const syncBookmarkButtons = () => {
  const buttons = document.querySelectorAll(".bookmark-toggle");
  buttons.forEach((button) => {
    const id = button.getAttribute("data-id");
    if (isBookmarked(id)) button.classList.add("is-saved");
    else button.classList.remove("is-saved");
  });
};

/* ---------- AUTENTIKASI (localStorage) ---------- */

// ALUR: tampilkan modal masuk/daftar: set mode tab, bersihkan input & pesan error, lalu fokuskan ke username.
const openAuthModal = (mode) => {
  dom.authModal.hidden = false;
  setAuthMode(mode || "login");
  dom.authError.hidden = true;
  dom.authUser.value = "";
  dom.authPass.value = "";
  dom.authName.value = "";
  if (dom.authEmail) dom.authEmail.value = "";
  setTimeout(() => dom.authUser.focus(), 60);
};

// ALUR: sembunyikan modal; isi form dibiarkan dan dibersihkan saat dibuka kembali.
const closeAuthModal = () => { dom.authModal.hidden = true; };

const setAuthMode = (mode) => {
  const isRegister = mode === "register";
  dom.tabLogin.setAttribute("aria-selected", String(!isRegister));
  dom.tabRegister.setAttribute("aria-selected", String(isRegister));
  dom.nameField.hidden = !isRegister;
  if (dom.emailField) dom.emailField.hidden = !isRegister;
  dom.authSubmit.textContent = isRegister ? "Daftar Sekarang" : "Masuk";
  dom.authForm.setAttribute("data-mode", mode);
  // token autocomplete agar password manager benar: isi-baru saat daftar, isi-ada saat masuk
  dom.authPass.setAttribute("autocomplete", isRegister ? "new-password" : "current-password");
};

/** Pemeriksaan sederhana format email (cukup untuk validasi sisi klien). */
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || "").trim());

// ALUR: PROSES LOGIN / DAFTAR:
// 1) ambil & rapikan input, 2) validasi: username wajib, password min 4,
// mode daftar tambah: nama & email wajib + format email,
// 3) DAFTAR: tolak bila username/email sudah dipakai, simpan akun baru, langsung masuk,
// 4) MASUK: cocokkan password dengan akun tersimpan, lalu loginAs().
const submitAuth = () => {
  const mode = dom.authForm.getAttribute("data-mode") || "login";
  const username = dom.authUser.value.trim().toLowerCase();
  const password = dom.authPass.value;
  const name = dom.authName.value.trim();
  const email = dom.authEmail ? dom.authEmail.value.trim() : "";

  // note kecil: meampilkan satu pesan kesalahan pada form lalu batalkan proses.
  const fail = (message) => {
    dom.authError.textContent = message;
    dom.authError.hidden = false;
    return false;
  };

  if (!username) return fail("Username wajib diisi.");
  if (password.length < 4) return fail("Password minimal 4 karakter.");
  if (mode === "register") {
    if (!name) return fail("Nama wajib diisi.");
    if (!email) return fail("Email wajib diisi.");
    if (!isValidEmail(email)) return fail("Format email belum benar. Contoh: nama@email.com");
  }

  // Muat seluruh akun terdaftar dari localStorage (bentuk {username: dataAkun}).
  const users = readStore(STORE_KEYS.users, {});

  if (mode === "register") {
    if (users[username]) return fail("Username sudah dipakai. Silakan masuk.");
    const emailSudahAda = Object.keys(users).some(
      (key) => String(users[key].email || "").toLowerCase() === email.toLowerCase()
    );
    if (emailSudahAda) return fail("Email ini sudah terdaftar. Silakan masuk.");

    users[username] = {
      username,
      name,
      email,
      password,
      createdAt: new Date().toISOString()
    };
    writeStore(STORE_KEYS.users, users);
    loginAs(username, { name, email }, true);
    return true;
  }

  if (!users[username]) return fail("Username belum terdaftar. Coba daftar dulu.");
  if (users[username].password !== password) return fail("Password tidak cocok.");
  loginAs(username, { name: users[username].name, email: users[username].email }, false);
  return true;
};

// ALUR: MENJADIKAN AKUN AKTIF:
// 1) susun objek user dari data tersimpan, 2) simpan sesi ke localStorage,
// 3) bila ada bookmark saat tamu → gabungkan ke akun lalu kosongkan bookmark tamu,
// 4) muat ulang bookmark & riwayat baca, 5) perbarui tampilan header & tutup modal.
const loginAs = (username, profil, isNew) => {
  const users = readStore(STORE_KEYS.users, {});
  const tersimpan = users[username] || {};

  state.user = {
    username,
    name: (profil && profil.name) || tersimpan.name || username,
    email: (profil && profil.email) || tersimpan.email || "",
    createdAt: tersimpan.createdAt || null
  };
  writeStore(STORE_KEYS.session, state.user);

  // Gabungkan bookmark tamu ke akun bila ada
  const all = readStore(STORE_KEYS.bookmarks, {});
  const guest = Array.isArray(all.guest) ? all.guest : [];
  const mine = Array.isArray(all["u:" + username]) ? all["u:" + username] : [];
  const merged = Array.from(new Set(mine.concat(guest)));  // Set menghilangkan id ganda saat bookmark tamu digabungkan ke akun.
  if (guest.length) {
    all["u:" + username] = merged;
    all.guest = [];
    writeStore(STORE_KEYS.bookmarks, all);
    showToast(guest.length + " berita tersimpan sebagai tamu dipindahkan ke akunmu.", "success");
  }

  loadBookmarks();
  loadReads();
  updateUserUi();
  closeAuthModal();
  showToast(isNew ? "Akun berhasil dibuat. Selamat membaca, " + state.user.name + "!" : "Selamat datang kembali, " + state.user.name + "!", "success");
  if (dom.pageBookmark && !dom.pageBookmark.hidden) renderBookmarkPage();
  if (dom.pageProfile && !dom.pageProfile.hidden) renderProfilePage();
};

// ALUR: KELUAR AKUN: kosongkan state.user, hapus sesi tersimpan, kembali ke data tamu, perbarui header & halaman.
const logout = () => {
  state.user = null;
  removeStore(STORE_KEYS.session);
  loadBookmarks();
  loadReads();
  updateUserUi();
  showToast("Kamu sudah keluar dari akun.", "warn");
  if (dom.pageBookmark && !dom.pageBookmark.hidden) renderBookmarkPage();
  if (dom.pageProfile && !dom.pageProfile.hidden) renderProfilePage();
};

// ALUR: sesuaikan header dengan status login: label tombol jadi nama depan pengguna (atau 'Masuk'),
// atur atribut aria/title, dan tampilkan tombol 'Keluar' hanya saat ada akun aktif.
const updateUserUi = () => {
  const sudahMasuk = Boolean(state.user);

  dom.authLabel.textContent = sudahMasuk ? state.user.name.split(" ")[0] : "Masuk";
  dom.authBtn.setAttribute("aria-label", sudahMasuk
    ? "Berita tersimpan milik " + state.user.name
    : "Masuk ke akun");
  dom.authBtn.setAttribute("title", sudahMasuk
    ? "Lihat berita tersimpan milik " + state.user.name
    : "Masuk ke akun");
  dom.authBtn.classList.toggle("is-logged", sudahMasuk);

  // Tombol keluar hanya muncul ketika ada akun yang sedang masuk
  if (dom.logoutBtn) dom.logoutBtn.hidden = !sudahMasuk;
};

/* ---------- SHARE ---------- */

// ALUR: daftar tujuan berbagi. Tiap item punya fungsi build(url, judul) yang membentuk tautan share masing-masing layanan.
const SHARE_TARGETS = [
  { id: "whatsapp", label: "WhatsApp", build: (u, t) => "https://wa.me/?text=" + encodeURIComponent(t + " " + u) },
  { id: "x", label: "X / Twitter", build: (u, t) => "https://twitter.com/intent/tweet?text=" + encodeURIComponent(t) + "&url=" + encodeURIComponent(u) },
  { id: "facebook", label: "Facebook", build: (u, t) => "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(u) + "&quote=" + encodeURIComponent(t) },
  { id: "telegram", label: "Telegram", build: (u, t) => "https://t.me/share/url?url=" + encodeURIComponent(u) + "&text=" + encodeURIComponent(t) },
  { id: "linkedin", label: "LinkedIn", build: (u, t) => "https://www.linkedin.com/sharing/share-offsite/?url=" + encodeURIComponent(u) }
];

// ALUR: URL lengkap halaman saat ini (asal + path + hash).
const currentUrl = () => window.location.origin + window.location.pathname + window.location.hash;

// ALUR: susun tombol berbagi satu berita: 5 layanan (buka tab baru), tombol salin tautan,
// ditambah tombol share native bila browser mendukung navigator.share (umumnya di HP).
const buildShareButtons = (article) => {
  const url = shareUrlOf(article);
  const text = article.title + " — " + article.sourceName;

  const buttons = SHARE_TARGETS.map((target) => el("a", {
    className: "share-btn",
    attrs: { href: target.build(url, text), target: "_blank", rel: "noopener noreferrer" },
    text: target.label
  }));

  const copyBtn = el("button", { className: "share-btn", attrs: { type: "button" } }, [
    icon("link", "ico-sm"), el("span", { text: "Salin tautan" })
  ]);
  copyBtn.addEventListener("click", () => copyToClipboard(url));

  if (navigator.share) {
    const nativeBtn = el("button", { className: "share-btn", attrs: { type: "button" }, text: "Bagikan lewat aplikasi…" });
    nativeBtn.addEventListener("click", () => {
      navigator.share({ title: article.title, text, url })
        .then(() => showToast("Berita berhasil dibagikan.", "success"))
        .catch((error) => {
          if (error && error.name !== "AbortError") showToast("Gagal membagikan berita.", "error");
        });
    });
    buttons.push(nativeBtn);
  }

  buttons.push(copyBtn);
  return buttons;
};

// ALUR: salin teks melalui Clipboard API modern; bila browser tidak mendukung, memakai cara lama (fallbackCopy).
const copyToClipboard = (text) => {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => showToast("Tautan disalin ke papan klip.", "success"))
      .catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
};

// ALUR: cara lama menyalin: buat <textarea> tidak terlihat, pilih isinya, execCommand('copy'), lalu mengapus elemennya.
const fallbackCopy = (text) => {
  const area = el("textarea", { attrs: { "aria-hidden": "true" } });
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch (error) {
    ok = false;
  }
  document.body.removeChild(area);
  showToast(ok ? "Tautan disalin ke papan klip." : "Gagal menyalin tautan. Salin manual dari bilah alamat.", ok ? "success" : "error");
};

// ALUR: dipakai ikon bagikan di kartu: bila browser punya panel share native (HP) buka itu;
// bila tidak (desktop) arahkan ke halaman detail yang memuat tombol berbagi lengkap.
const openShare = (article) => {
  if (navigator.share) {
    navigator.share({ title: article.title, text: article.description, url: shareUrlOf(article) })
      .catch((error) => {
        if (error && error.name !== "AbortError") showToast("Gagal membuka panel berbagi.", "error");
      });
    return;
  }
  showToast("Gunakan tombol bagikan pada halaman berita untuk membagikannya.", "info");
  window.location.href = detailUrl(article);
};

/* 
 J. TEMA, ROUTER, INFINITE SCROLL, INIT
*/

// ALUR: GANTI TEMA: set atribut data-theme pada <html> → semua variabel CSS otomatis berganti →
// perbarui atribut aksesibilitas & warna meta browser → simpan pilihan ke localStorage.
const applyTheme = (theme) => {
  const value = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", value);
  dom.themeToggle.setAttribute("aria-pressed", String(value === "dark"));
  dom.themeToggle.setAttribute("aria-label", value === "dark" ? "Ganti ke mode terang" : "Ganti ke mode gelap");
  const meta = document.querySelector("meta[name='theme-color']");
  if (meta) meta.setAttribute("content", value === "dark" ? "#0e1116" : "#c8102e");
  writeStore(STORE_KEYS.theme, value);
};

// ALUR: tentukan tema awal: pilihan tersimpan di localStorage lebih diutamakan; bila belum ada,
// ikuti preferensi sistem operasi (mode gelap perangkat).
const initTheme = () => {
  const saved = readStore(STORE_KEYS.theme, null);
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(saved || (prefersDark ? "dark" : "light"));
};

// ALUR: BANGUN NAVIGASI & FOOTER: tautan Beranda → 9 kategori dari CATEGORIES → Trending → Tentang;
// juga mengisi tautan kategori di footer dan menulis tahun hak cipta otomatis.
const renderNav = () => {
  const links = [el("a", { className: "nav-link", attrs: { href: routeUrl("#/beranda"), "data-route": "home" }, text: "Beranda" })];
  CATEGORIES.forEach((cat) => {
    links.push(el("a", {
      className: "nav-link",
      attrs: { href: categoryUrl(cat.slug), "data-route": "category", "data-slug": cat.slug },
      text: cat.label
    }));
  });
  links.push(el("a", { className: "nav-link", attrs: { href: routeUrl("#/trending"), "data-route": "trending" }, text: "Trending" }));
  links.push(el("a", { className: "nav-link", attrs: { href: BASE + "about.html", "data-route": "tentang" }, text: "Tentang" }));
  fillNode(dom.navList, links);

  const footerLinks = CATEGORIES.slice(0, 6).map((cat) => el("li", {}, [
    el("a", { attrs: { href: categoryUrl(cat.slug) }, text: cat.label })
  ]));
  fillNode(dom.footerCategories, footerLinks);
  dom.footerYear.textContent = String(new Date().getFullYear());
};

// ALUR: beri tanda aktif (warna + garis bawah) pada tautan nav yang sesuai halaman/kategori sedang dibuka.
const setActiveNav = (routeName, slug) => {
  const links = dom.navList.querySelectorAll(".nav-link");
  links.forEach((link) => {
    const matchRoute = link.getAttribute("data-route") === routeName;
    const matchSlug = !slug || link.getAttribute("data-slug") === slug;
    if (matchRoute && matchSlug) link.classList.add("is-active");
    else link.classList.remove("is-active");
  });
};

// ALUR: pecah hash URL menjadi bagian terstruktur.
// Contoh '#/berita/12-judul?q=inflasi' → { segments: ['berita','12-judul'], params: { q: 'inflasi' } }.
const parseHash = (hash) => {
  const raw = String(hash || "").replace(/^#\/?/, "");
  const [pathPart, queryPart] = raw.split("?");
  const segments = pathPart.split("/").filter(Boolean).map(decodeURIComponent);
  const params = {};
  if (queryPart) {
    queryPart.split("&").forEach((pair) => {
      const [key, value] = pair.split("=");
      if (key) params[decodeURIComponent(key)] = decodeURIComponent(value || "");
    });
  }
  return { segments, params };
};

// ALUR: PENGENDALI HALAMAN (hanya aktif di index.html) — dijalankan setiap hash berubah:
// baca segmen pertama hash →
// 'beranda'/'kategori'/'berita'/'cari'/'tersimpan'/'profil'/'trending'
// lalu tampilkan section terkait (showPage) + render datanya;
// saat membuka detail sekaligus catat kunjungan (registerView); segmen tidak dikenal → halaman 404.
const router = () => {
  const { segments, params } = parseHash(window.location.hash);
  const first = segments[0] || "beranda";

  if (first === "beranda" || first === "") {
    state.route = { name: "home" };
    showPage("pageHome");
    setActiveNav("home");
    return;
  }

  if (first === "kategori" && segments[1]) {
    const slug = segments[1];
    if (!CATEGORY_LABELS[slug]) {
      state.route = { name: "404" };
      showPage("page404");
      setActiveNav("none");
      return;
    }
    const category = CATEGORIES.find((item) => item.slug === slug);
    state.route = { name: "category", slug };
    showPage("pageCategory");
    setActiveNav("category", slug);
    dom.catTitle.textContent = category.label;
    dom.catDesc.textContent = category.desc;
    fillNode(dom.catCrumbs, [
      el("a", { attrs: { href: routeUrl("#/beranda") }, text: "Beranda" }),
      el("span", { text: "/" }),
      el("span", { text: category.label })
    ]);
    resetFeed("category", { category: slug });
    renderFeedPage("category");
    return;
  }

  if (first === "berita" && segments[1]) {
    const id = parseArticleId(segments[1]);
    const article = findArticleById(id);
    if (!article) {
      state.route = { name: "404" };
      showPage("page404");
      setActiveNav("none");
      return;
    }
    state.route = { name: "detail", id };
    showPage("pageDetail");
    setActiveNav("category", article.category);
    registerView(id);
    renderDetail(article);
    return;
  }

  if (first === "cari") {
    const query = params.q || state.query || "";
    state.route = { name: "search" };
    showPage("pageSearch");
    setActiveNav("none");
    resetFeed("search", { query, category: state.feeds.search ? state.feeds.search.category : "semua" });
    renderSearchPage(query);
    renderFeedPage("search");
    return;
  }

  if (first === "tersimpan") {
    state.route = { name: "bookmark" };
    showPage("pageBookmark");
    setActiveNav("none");
    renderBookmarkPage();
    return;
  }

  if (first === "profil") {
    state.route = { name: "profile" };
    showPage("pageProfile");
    setActiveNav("none");
    renderProfilePage();
    return;
  }

  if (first === "trending") {
    state.route = { name: "trending" };
    showPage("pageTrending");
    setActiveNav("trending");
    renderTrendingPage();
    return;
  }

  state.route = { name: "404" };
  showPage("page404");
  setActiveNav("none");
};

/** Mencatat kunjungan berita ke localStorage (dipakai untuk trending). */
const registerView = (id) => {
  const key = String(id);
  const views = readStore(STORE_KEYS.views, {});
  // Tambah 1 kunjungan untuk berita yang sedang dibuka.
  views[key] = (Number(views[key]) || 0) + 1;
  writeStore(STORE_KEYS.views, views);
  markRead(key);

  const article = state.articles.find((item) => String(item.id) === key);
  if (article) {
    article.localViews = views[key];
    article.totalViews = (Number(article.views) || 0) + views[key];
  }
};

/** Menerapkan kunjungan lokal ke seluruh artikel setiap kali data dimuat. */
const applyLocalViews = () => {
  const views = readStore(STORE_KEYS.views, {});
  state.articles = state.articles.map((item) => mergeViews(item, views));
};

/** Pemuatan awal: skeleton -> data -> render. */
// ALUR: ALUR MUAT AWAL (beranda) — inti aplikasi saat halaman dibuka:
// 1) tampilkan beranda + SEMUA kerangka skeleton (hero, grafik, grid kartu),
// 2) minta data dari API (loadArticles),
// 3) normalisasi & gabungkan kunjungan lokal dari localStorage,
// 4) render hero, grafik, chip, feed, saran pencarian,
// 5) jalankan router() sesuai hash URL (mendukung tautan dibuka langsung),
// 6) bila gagal → renderError() menampilkan halaman kesalahan.
const bootstrap = async () => {
  state.loading = true;
  showPage("pageHome");
  fillNode(dom.heroSection, [createHeroSkeleton()]);
  fillNode(dom.trendingCharts, [createChartSkeleton()]);
  renderSkeletonFeed("home", CONFIG.pageSize);
  dom.homeChips && clearNode(dom.homeChips);

  try {
    // ALUR INTI: ambil data berita dari API (lihat fetchRemoteArticles untuk penanganan error).
    const result = await loadArticles();
    state.articles = result.articles;
    state.meta = result.meta;
    // Gabungkan kunjungan tersimpan di browser ke angka pembaca tiap artikel.
    applyLocalViews();
    state.error = null;
    state.loading = false;

    renderHero(state.articles);
    renderTrendingBlock();
    renderHomeChips();
    resetFeed("home", { category: state.feeds.home ? state.feeds.home.category : "semua" });
    renderFeedPage("home");
    renderSuggest();
    // Tampilkan halaman sesuai hash URL (mis. pengguna membuka tautan #/berita/3-judul langsung).
    router();
  } catch (error) {
    state.loading = false;
    // Jika data gagal, menampilkan halaman error beserta tombol 'Coba Lagi'.
    renderError(error);
  }
};

/**
 * Pemuatan data untuk halaman kategori (kategori/xxx.html).
 * Berkas HTML-nya terpisah, logika & datanya tetap satu app.js.
 */
const bootstrapCategoryPage = async () => {
  // ALUR (halaman kategori): cocokkan atribut data-kategori pada <body> dengan daftar CATEGORIES.
  const category = CATEGORIES.find((item) => item.slug === PAGE_KATEGORI);

  if (!category) {
    renderError(makeError(
      "CATEGORY",
      "Kategori tidak dikenal.",
      "Berkas ini memakai data-kategori=\"" + (PAGE_KATEGORI || "kosong") + "\" yang tidak ada di daftar kategori."
    ));
    return;
  }

  showPage("pageCategory");
  setActiveNav("category", category.slug);

  dom.catTitle.textContent = category.label;
  dom.catDesc.textContent = category.desc;
  // Ubah judul tab browser sesuai kategori yang dibuka.
  document.title = "Berita " + category.label + " Terbaru — NusaKini";
  fillNode(dom.catCrumbs, [
    el("a", { attrs: { href: routeUrl("#/beranda") }, text: "Beranda" }),
    el("span", { text: "/" }),
    el("span", { text: category.label })
  ]);

  state.loading = true;
  renderSkeletonFeed("category", CONFIG.pageSize);

  try {
    const result = await loadArticles();
    state.articles = result.articles;
    state.meta = result.meta;
    applyLocalViews();
    state.error = null;
    state.loading = false;

    resetFeed("category", { category: category.slug });
    renderFeedPage("category");
    renderSuggest();
  } catch (error) {
    state.loading = false;
    renderError(error);
  }
};

/** Halaman about/tentang: isinya statis di HTML, cukup lengkapi nav & footer. */
const bootstrapAboutPage = () => {
  setActiveNav("tentang");
  renderSuggest();
};

/** Dipakai tombol "Coba Lagi" agar memuat ulang halaman yang sedang dibuka. */
const reloadCurrentPage = () => {
  if (PAGE_MODE === "kategori") return bootstrapCategoryPage();
  if (PAGE_MODE === "tentang") { bootstrapAboutPage(); return undefined; }
  return bootstrap();
};

/** Saran pencarian populer. */
const renderSuggest = () => {
  const words = ["inflasi", "timnas", "banjir", "mobil listrik", "kecerdasan buatan", "stunting", "ekspor", "film"];
  const buttons = words.map((word) => el("button", {
    className: "chip",
    attrs: { type: "button", "data-word": word },
    text: word
  }));
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const word = button.getAttribute("data-word");
      dom.searchInput.value = word;
      window.location.href = routeUrl("#/cari?q=" + encodeURIComponent(word));
      closeSearchPanel();
    });
  });
  fillNode(dom.searchSuggest, buttons);
};

/* ---------- PENCARIAN (UI) ---------- */

const openSearchPanel = () => {
  dom.searchPanel.hidden = false;
  dom.searchToggle.setAttribute("aria-expanded", "true");
  setTimeout(() => dom.searchInput.focus(), 50);
};

const closeSearchPanel = () => {
  dom.searchPanel.hidden = true;
  dom.searchToggle.setAttribute("aria-expanded", "false");
};

// ALUR: pembungkus agar fungsi tidak jalan tiap ketukan — pencarian langsung baru dijalankan 400ms setelah berhenti mengetik.
const debounce = (fn, wait) => {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
};

/* ---------- INFINITE SCROLL ---------- */

const setupInfiniteScroll = () => {
  if (!("IntersectionObserver" in window)) return;  // Tanpa dukungan IntersectionObserver, gulir otomatis tidak dipasang.

  // ALUR: observer memanggil callback ini setiap elemen sentinel masuk/keluar area layar.
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting || state.loading) return;
      const key = entry.target.getAttribute("data-feed");
      if (key) loadMoreFeed(key);
    });
  // Muat berikutnya dimulai saat sentinel masih 320px di bawah layar → terasa instan tanpa menunggu.
  }, { rootMargin: "320px 0px" });  // Muatan berikutnya dimulai sejak 320px sebelum sentinel terlihat agar terasa instan.

  ["home", "category", "search"].forEach((key) => {
    const sentinel = feedTargets[key].sentinel();
    if (sentinel) {
      sentinel.setAttribute("data-feed", key);
      observer.observe(sentinel);
    }
  });
};

/* ---------- EVENT GLOBAL ---------- */

// ALUR: MEMASANG SEMUA EVENT LISTENER dalam satu tempat, dikelompokkan:
// tombol menu menu mobile • ganti tema • buka/tutup/submit pencarian + live search (debounce) •
// hapus semua bookmark (via modal konfirmasi) • tombol masuk/profil • tombol keluar •
// modal konfirmasi (Batal/Ya/backdrop/Escape) • tab & submit form login • tombol tamu •
// tombol 'Coba Lagi' di halaman error • hashchange → router (hanya di index) •
// efek header & tombol ke atas saat menggulir.
const setupEvents = () => {
  // navigasi mobile
  dom.navToggle.addEventListener("click", () => {
    const open = dom.siteNav.classList.toggle("is-open");
    document.body.classList.toggle("nav-open", open);
    dom.navToggle.setAttribute("aria-expanded", String(open));
    dom.navToggle.setAttribute("aria-label", open ? "Tutup menu navigasi" : "Buka menu navigasi");
  });

  // tema
  dom.themeToggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    applyTheme(current === "dark" ? "light" : "dark");
  });

  // panel pencarian
  dom.searchToggle.addEventListener("click", () => {
    if (dom.searchPanel.hidden) openSearchPanel();
    else closeSearchPanel();
  });
  dom.searchClose.addEventListener("click", closeSearchPanel);

  dom.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = dom.searchInput.value.trim();
    if (!query) {
      showToast("Ketik dulu kata kunci yang ingin dicari.", "warn");
      return;
    }
    window.location.href = routeUrl("#/cari?q=" + encodeURIComponent(query));
    closeSearchPanel();
  });

  const liveSearch = debounce(() => {
    const query = dom.searchInput.value.trim();
    if (query.length < 2) return;
    state.query = query;
    resetFeed("search", { query });
    renderSearchPage(query);
    renderFeedPage("search");
  }, 400);
  if (dom.searchGrid) dom.searchInput.addEventListener("input", liveSearch);

  // bookmark (tombol ini hanya ada di halaman Berita Tersimpan)
  if (dom.clearBookmarks) dom.clearBookmarks.addEventListener("click", () => {
    if (!state.bookmarks.length) {
      showToast("Daftar tersimpanmu masih kosong.", "warn");
      return;
    }
    // pakai modal konfirmasi yang sama seperti keluar akun (bukan window.confirm)
    openConfirm({
      title: "Hapus semua berita tersimpan?",
      text: "Semua " + state.bookmarks.length + " berita di daftar tersimpan akan dihapus. Tindakan ini tidak bisa dibatalkan.",
      okLabel: "Ya, Hapus",
      onConfirm: () => {
        state.bookmarks = [];
        saveBookmarks();
        renderBookmarkPage();
        syncBookmarkButtons();
        showToast("Semua berita tersimpan sudah dihapus.", "warn");
      }
    });
  });

  // autentikasi: tombol nama membuka modal masuk, atau (bila sudah masuk)
  // membuka daftar berita tersimpan. Keluar akun melalui tombolnya sendiri.
  dom.authBtn.addEventListener("click", () => {
    if (state.user) {
      window.location.href = routeUrl("#/profil");
      return;
    }
    openAuthModal("login");
  });

  if (dom.logoutBtn) {
    dom.logoutBtn.addEventListener("click", () => {
      openConfirm({
        title: "Keluar dari akun?",
        text: state.user
          ? "Kamu akan keluar dari akun " + state.user.name + ". Berita yang kamu simpan tetap aman dan bisa dibuka lagi setelah masuk."
          : "Kamu akan keluar dari akun ini.",
        okLabel: "Ya, Keluar",
        onConfirm: logout
      });
    });
  }

  // modal konfirmasi
  if (dom.confirmCancel) dom.confirmCancel.addEventListener("click", closeConfirm);
  if (dom.confirmOk) {
    dom.confirmOk.addEventListener("click", () => {
      const aksi = confirmAction;
      closeConfirm();
      if (aksi) aksi();
    });
  }
  if (dom.confirmModal) {
    dom.confirmModal.addEventListener("click", (event) => {
      if (event.target.hasAttribute("data-close-confirm")) closeConfirm();
    });
  }
  dom.tabLogin.addEventListener("click", () => setAuthMode("login"));
  dom.tabRegister.addEventListener("click", () => setAuthMode("register"));
  dom.authForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitAuth();
  });
  dom.guestBtn.addEventListener("click", () => {
    closeAuthModal();
    showToast("Kamu melanjutkan sebagai tamu. Simpanan tetap tersimpan di browser ini.", "info");
  });
  dom.authModal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close]")) closeAuthModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAuthModal();
      closeConfirm();
      closeSearchPanel();
    }
  });

  // tombol error: muat ulang data dari API
  dom.errorRetry.addEventListener("click", () => reloadCurrentPage());

  // router hanya berjalan di index.html; sub-halaman (kategori/tentang)
  // menampilkan satu konten tetap sehingga tidak butuh hash router
  if (PAGE_MODE === "beranda") {
    window.addEventListener("hashchange", () => {
      if (state.loading) return;
      router();
      window.scrollTo({ top: 0, behavior: "auto" });
    });
  }

  // tombol ke atas
  window.addEventListener("scroll", () => {
    dom.toTop.hidden = window.scrollY < 500;
    if (window.scrollY > 0) {
      dom.siteHeader.classList.add("is-scrolled");
    } else {
      dom.siteHeader.classList.remove("is-scrolled");
    }
  }, { passive: true });

  dom.toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
};

/* ---------- JALANKAN ---------- */

// ALUR: TITIK MULAI APLIKASI — dijalankan setelah HTML siap. Urutan:
// 1) cacheDom() — pegang semua elemen, 2) initTheme() — tema terang/gelap,
// 3) renderNav() — isi nav & footer, 4) setupEvents() — pasang semua event,
// 5) setupInfiniteScroll() — pantau sentinel, 6) pulihkan sesi akun dari localStorage,
// 7) muat bookmark & riwayat baca, 8) tulis tanggal header,
// 9) alur muat sesuai jenis halaman: kategori → bootstrapCategoryPage(), tentang → bootstrapAboutPage(), selainnya → bootstrap().
const init = () => {
  cacheDom();
  initTheme();
  renderNav();
  setupEvents();
  setupInfiniteScroll();

  state.user = readStore(STORE_KEYS.session, null);
  updateUserUi();
  loadBookmarks();
  loadReads();

  const now = new Date();
  dom.headerDate.textContent = DAYS_ID[now.getDay()] + ", " + now.getDate() + " " + MONTHS_ID[now.getMonth()] + " " + now.getFullYear();

  // Tiap berkas HTML punya alur muat datanya sendiri
  if (PAGE_MODE === "kategori") bootstrapCategoryPage();
  else if (PAGE_MODE === "tentang") bootstrapAboutPage();
  else bootstrap();
};

// ALUR: tunggu HTML selesai diparse (event DOMContentLoaded) sebelum init(); bila berkas dimuat saat DOM sudah siap, jalankan langsung.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
/* Ekspor utilitas murni supaya bisa diuji otomatis.
 Blok ini hanya aktif di Node (saat pengujian) dan tidak berpengaruh
 ketika berkas dijalankan di browser. */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    slugify, cleanApiContent, normalizeArticle, normalizeApiPayload, splitParagraphs,
    pickCategory, formatNumber, formatCompact, formatDateId, timeAgo, readingTime, truncate,
    filterByCategory, sortNewest, searchArticles, mergeViews, trendingScore, rankByViews,
    viewsByCategory, paginate, barChartGeometry, donutChartGeometry, CATEGORIES, CATEGORY_LABELS
  };
}
