import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'

type VerificationState = {
  [key: string]: {
    status: string
    error?: string
  }
}

type VerificationStatusProps = {
  verificationState: VerificationState
  isDarkMode?: boolean
}

function VerificationStatus({
  verificationState,
  isDarkMode = true,
}: VerificationStatusProps) {
  const hasErrors = Object.values(verificationState).some(
    (state) => state.error,
  )
  const allSuccess = Object.values(verificationState).every(
    (state) => state.status === 'success',
  )

  const status: 'error' | 'success' | 'progress' = hasErrors
    ? 'error'
    : allSuccess
      ? 'success'
      : 'progress'

  const containerColors =
    status === 'error'
      ? isDarkMode
        ? 'bg-red-500/10 text-red-400'
        : 'bg-red-50 text-red-600'
      : status === 'success'
        ? isDarkMode
          ? 'bg-emerald-500/10 text-emerald-400'
          : 'bg-emerald-50 text-emerald-600'
        : isDarkMode
          ? 'bg-blue-500/10 text-blue-400'
          : 'bg-blue-50 text-blue-600'

  return (
    <div
      className={`mt-0 flex min-h-16 items-start gap-2 p-3 transition-colors duration-300 ${containerColors}`}
    >
      {status === 'error' && (
        <>
          <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <p className="overflow-hidden break-words break-all text-sm">
            Verification failed. Please check the errors.
          </p>
        </>
      )}

      {status === 'success' && (
        <div className="flex flex-col gap-1">
          <p className="text-sm">This AI is running inside a secure enclave.</p>
          <div
            className={`flex items-center gap-2 opacity-70 ${
              isDarkMode ? 'text-white' : 'text-gray-700'
            }`}
          >
            <span className="text-xs">Attested by</span>
            <span className="text-xs">NVIDIA</span>
            <span className="text-sm">·</span>
            <span className="text-xs">AMD</span>
            <span className="text-sm">·</span>
            <span className="text-xs">Intel</span>
          </div>
        </div>
      )}

      {status === 'progress' && (
        <p className="break-words text-sm">
          Verification in progress. This process ensures your data remains
          secure and private by confirming code integrity and runtime
          environment isolation.
        </p>
      )}
    </div>
  )
}

export default VerificationStatus

