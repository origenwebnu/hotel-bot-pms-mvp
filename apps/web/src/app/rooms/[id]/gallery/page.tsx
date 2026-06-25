'use client';

import { useEffect, useState, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

type GalleryData = {
  room_id: string;
  hotel_name: string;
  name: string;
  description: string | null;
  price_per_night: number;
  currency: string;
  photo_urls: string[];
  check_in: string | null;
  check_out: string | null;
  adults: number | null;
  whatsapp_continue_url: string | null;
};

function RoomGalleryContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const token = searchParams.get('token') ?? '';
  const [data, setData] = useState<GalleryData | null>(null);
  const [error, setError] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!token) {
      setError('Enlace de galería inválido.');
      return;
    }

    fetch(`/api/public/rooms/${id}?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('No se pudo cargar la galería');
        return res.json();
      })
      .then((payload) => {
        setData(payload);
        setActiveIndex(0);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Error'));
  }, [id, token]);

  if (error) {
    return (
      <main className="page">
        <div className="card error">{error}</div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="page">
        <div className="card">Cargando galería...</div>
      </main>
    );
  }

  const activePhoto = data.photo_urls[activeIndex] ?? data.photo_urls[0];

  return (
    <main className="page">
      <div className="content">
        <header className="header">
          <p className="eyebrow">{data.hotel_name}</p>
          <h1>{data.name}</h1>
          {data.description ? <p className="description">{data.description}</p> : null}
          <p className="price">
            {data.currency} {data.price_per_night.toLocaleString('es-CO')} / noche
          </p>
        </header>

        {activePhoto ? (
          <div className="hero-wrap">
            <img src={activePhoto} alt={data.name} className="hero" />
          </div>
        ) : null}

        {data.photo_urls.length > 1 ? (
          <div className="thumbs">
            {data.photo_urls.map((url, index) => (
              <button
                key={url}
                type="button"
                className={`thumb ${index === activeIndex ? 'active' : ''}`}
                onClick={() => setActiveIndex(index)}
              >
                <img src={url} alt={`${data.name} ${index + 1}`} />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {data.whatsapp_continue_url ? (
        <a className="continue-btn" href={data.whatsapp_continue_url}>
          Continuar reserva
        </a>
      ) : (
        <div className="continue-fallback">
          Vuelve a WhatsApp y escribe <strong>Continuar reserva</strong>
        </div>
      )}

      <style jsx>{`
        .page {
          min-height: 100vh;
          background: #0f172a;
          color: #fff;
          padding: 1rem 1rem 6rem;
        }
        .content {
          max-width: 720px;
          margin: 0 auto;
        }
        .header {
          margin-bottom: 1rem;
        }
        .eyebrow {
          color: #94a3b8;
          font-size: 0.85rem;
          margin-bottom: 0.25rem;
        }
        h1 {
          font-size: 1.6rem;
          margin-bottom: 0.5rem;
        }
        .description {
          color: #cbd5e1;
          line-height: 1.5;
          margin-bottom: 0.75rem;
        }
        .price {
          color: #86efac;
          font-weight: 600;
        }
        .hero-wrap {
          border-radius: 16px;
          overflow: hidden;
          background: #1e293b;
        }
        .hero {
          width: 100%;
          max-height: 70vh;
          object-fit: cover;
          display: block;
        }
        .thumbs {
          display: flex;
          gap: 0.75rem;
          overflow-x: auto;
          padding: 1rem 0;
        }
        .thumb {
          border: 2px solid transparent;
          border-radius: 12px;
          overflow: hidden;
          padding: 0;
          background: none;
          flex: 0 0 88px;
          height: 66px;
          cursor: pointer;
        }
        .thumb.active {
          border-color: #22c55e;
        }
        .thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .continue-btn {
          position: fixed;
          left: 50%;
          bottom: 1.25rem;
          transform: translateX(-50%);
          background: #16a34a;
          color: #fff;
          text-decoration: none;
          font-weight: 700;
          padding: 0.95rem 1.5rem;
          border-radius: 999px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
          z-index: 10;
          white-space: nowrap;
        }
        .continue-fallback {
          position: fixed;
          left: 1rem;
          right: 1rem;
          bottom: 1.25rem;
          background: #1e293b;
          border: 1px solid #334155;
          color: #e2e8f0;
          padding: 0.85rem 1rem;
          border-radius: 12px;
          text-align: center;
          font-size: 0.92rem;
        }
        .card {
          max-width: 420px;
          margin: 2rem auto;
          background: #fff;
          color: #0f172a;
          border-radius: 16px;
          padding: 1.5rem;
        }
        .error {
          color: #b91c1c;
        }
      `}</style>
    </main>
  );
}

export default function RoomGalleryPage() {
  return (
    <Suspense
      fallback={
        <main className="page">
          <div>Cargando...</div>
        </main>
      }
    >
      <RoomGalleryContent />
    </Suspense>
  );
}
