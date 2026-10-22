import Link from 'next/link';

export default function Home() {
  const stations = [
    {
      id: 'us:fps',
      name: 'Flight Park South (US)',
      description: 'Fetches public observation data from the US National Weather Service (NWS) endpoints.',
    },
    {
      id: 'de:holfuy:263',
      name: 'Holfuy 263 (DE)',
      description: 'Parses public measurement embeddings for Holfuy targets.',
    },
    {
      id: 'de:IKOBER13',
      name: 'Wunderground PWS (DE)',
      description: 'Scrapes public Wunderground PWS history.',
    },
  ];

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center py-20 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-3xl w-full text-center space-y-8">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl text-white">
          Meteo Rose
        </h1>
        <p className="text-xl text-gray-400">
          Zero-Key Browser-ML Paragliding Weather Bias-Correction App
        </p>

        <div className="mt-12 grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {stations.map((station) => (
            <Link key={station.id} href={`/${encodeURIComponent(station.id)}`}>
              <div className="bg-gray-800 rounded-2xl shadow-lg hover:shadow-xl transition-shadow duration-300 overflow-hidden cursor-pointer h-full border border-gray-700 hover:border-blue-500">
                <div className="p-6 flex flex-col h-full">
                  <h3 className="text-lg font-bold text-white mb-2">{station.name}</h3>
                  <p className="text-sm text-gray-400 flex-grow">{station.description}</p>
                  <div className="mt-4 text-blue-400 text-sm font-medium flex items-center justify-end">
                    View Forecast &rarr;
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
