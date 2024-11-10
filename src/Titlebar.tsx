import { useRef } from 'react'

import { AccessibilityNew } from '@mui/icons-material'
import { IconButton } from '@mui/material'

function Titlebar({
  isTitlebarVisible,
  setIsTitlebarVisible
}: {
  isTitlebarVisible: boolean
  setIsTitlebarVisible: (isTitlebarVisible: boolean) => void
}): JSX.Element {
  const titlebarContainerRef = useRef<HTMLDivElement>(null)

  return (
    <div
      className="titlebar-container"
      ref={titlebarContainerRef}
      onMouseEnter={() => setIsTitlebarVisible(true)}
    >
      {isTitlebarVisible && (
        <div className="titlebar">
          <div className="titlebar-item">
            <IconButton color="error" component="label" onClick={() => {}} size="small">
              <AccessibilityNew />
            </IconButton>
          </div>
        </div>
      )}
    </div>
  )
}

export default Titlebar
