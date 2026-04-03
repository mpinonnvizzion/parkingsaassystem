import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="text-center max-w-lg">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          ParkingSystem
        </h1>
        <p className="text-lg text-gray-600 mb-8">
          Smart parking management for apartment complexes and private operators.
          Register vehicles, issue permits, and enforce parking — all in one place.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/login"
            className="bg-blue-600 text-white rounded-lg px-6 py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="bg-white text-gray-700 rounded-lg px-6 py-2.5 text-sm font-medium border border-gray-300 hover:bg-gray-50 transition-colors"
          >
            Property manager signup
          </Link>
          <Link
            href="/claim"
            className="bg-green-600 text-white rounded-lg px-6 py-2.5 text-sm font-medium hover:bg-green-700 transition-colors"
          >
            Resident? Claim your unit →
          </Link>
        </div>
      </div>
    </div>
  );
}
