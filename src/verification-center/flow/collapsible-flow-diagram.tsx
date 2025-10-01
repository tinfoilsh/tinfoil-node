'use client'

import { ChevronDownIcon } from '@heroicons/react/24/outline'
import React, { useId, useState } from 'react'
import { BsDiagram3 } from 'react-icons/bs'

type CollapsibleFlowDiagramProps = {
  children: React.ReactNode
  isDarkMode?: boolean
  isExpanded?: boolean
  onToggle?: () => void
}

export function CollapsibleFlowDiagram({
  children,
  isDarkMode = true,
  isExpanded: controlledIsExpanded,
  onToggle,
}: CollapsibleFlowDiagramProps) {
  const [internalIsExpanded, setInternalIsExpanded] = useState(false)
  const isExpanded = controlledIsExpanded ?? internalIsExpanded
  const contentId = useId()

  return (
    <div
      className={`w-full rounded-lg border @container ${
        isDarkMode ? 'border-gray-700' : 'border-gray-200 bg-white'
      }`}
    >
      <button
        type="button"
        onClick={() => {
          if (onToggle) {
            onToggle()
          } else {
            setInternalIsExpanded(!internalIsExpanded)
          }
        }}
        className="w-full p-4 text-left"
        aria-expanded={isExpanded}
        aria-controls={contentId}
      >
        <div className="flex flex-row items-center gap-3 md:gap-4">
          <div className="flex items-center">
            <BsDiagram3
              className={`h-6 w-6 ${isDarkMode ? 'text-white' : 'text-gray-600'}`}
            />
          </div>

          <div className="flex-1 text-center @[400px]:text-left">
            <h3
              className={`text-sm font-medium ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}
            >
              Verification Flow Diagram
            </h3>
            <p
              className={`hidden text-sm @[400px]:block ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}
            >
              Visual representation of the verification process and data flow
            </p>
          </div>

          <div
            className={`rounded-lg p-2 ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
          >
            <ChevronDownIcon
              className={`h-5 w-5 transition-transform ${
                isDarkMode ? 'text-gray-400' : 'text-gray-500'
              } ${isExpanded ? 'rotate-180' : ''}`}
            />
          </div>
        </div>
      </button>

      <div
        id={contentId}
        className={`${isDarkMode ? 'border-gray-700' : 'border-gray-200'} ${
          isExpanded ? 'border-t' : 'border-t-0'
        } overflow-hidden transition-all duration-300 ease-in-out ${
          isExpanded ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
        aria-hidden={!isExpanded}
      >
        <div
          className={`rounded-b-lg px-4 py-4 ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

