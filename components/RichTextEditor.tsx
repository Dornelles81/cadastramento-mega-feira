'use client'

import { useState, useRef, useEffect } from 'react'

interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  label?: string
  helpText?: string
}

export default function RichTextEditor({ 
  value, 
  onChange, 
  placeholder, 
  rows = 6,
  label,
  helpText
}: RichTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [selectionStart, setSelectionStart] = useState(0)
  const [selectionEnd, setSelectionEnd] = useState(0)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  // Popular emojis for quick access
  const popularEmojis = [
    '✅', '📱', '📋', '👤', '📸', '🎯', '🎪', '✨', '🔒', '💡',
    '⚡', '🚀', '✔️', '❌', '⚠️', '📍', '🎉', '👍', '⏰', '📧',
    '☎️', '🏠', '🆔', '💼', '📝', '🔍', '💾', '🗑️', '➕', '🔄'
  ]

  // Update selection when value changes
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.selectionStart = selectionStart
      textareaRef.current.selectionEnd = selectionEnd
    }
  }, [value])

  // Insert text at cursor position
  const insertText = (textToInsert: string, wrapStart = '', wrapEnd = '') => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selectedText = value.substring(start, end)
    
    const newText = 
      value.substring(0, start) + 
      wrapStart + 
      (selectedText || textToInsert) + 
      wrapEnd + 
      value.substring(end)
    
    onChange(newText)
    
    // Set cursor position after insert
    setTimeout(() => {
      if (textarea) {
        const newPosition = start + wrapStart.length + (selectedText || textToInsert).length + wrapEnd.length
        textarea.focus()
        textarea.setSelectionRange(newPosition, newPosition)
        setSelectionStart(newPosition)
        setSelectionEnd(newPosition)
      }
    }, 0)
  }

  // Format text with markdown-style syntax
  const formatBold = () => {
    insertText('texto em negrito', '**', '**')
  }

  const formatItalic = () => {
    insertText('texto em itálico', '_', '_')
  }

  const formatUnderline = () => {
    insertText('texto sublinhado', '__', '__')
  }

  const insertEmoji = (emoji: string) => {
    insertText(emoji)
    setShowEmojiPicker(false)
  }

  const insertBulletPoint = () => {
    const textarea = textareaRef.current
    if (!textarea) return
    
    const start = textarea.selectionStart
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    const newText = 
      value.substring(0, lineStart) + 
      '• ' + 
      value.substring(lineStart)
    
    onChange(newText)
    
    setTimeout(() => {
      const newPosition = lineStart + 2
      textarea.focus()
      textarea.setSelectionRange(newPosition, newPosition)
    }, 0)
  }

  const insertNumberedList = () => {
    const textarea = textareaRef.current
    if (!textarea) return
    
    const start = textarea.selectionStart
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    
    // Find the last number in the text
    const lines = value.substring(0, lineStart).split('\n')
    const lastLine = lines[lines.length - 2] || ''
    const match = lastLine.match(/^(\d+)\./)
    const nextNumber = match ? parseInt(match[1]) + 1 : 1
    
    const newText = 
      value.substring(0, lineStart) + 
      `${nextNumber}. ` + 
      value.substring(lineStart)
    
    onChange(newText)
    
    setTimeout(() => {
      const newPosition = lineStart + `${nextNumber}. `.length
      textarea.focus()
      textarea.setSelectionRange(newPosition, newPosition)
    }, 0)
  }

  const insertDivider = () => {
    insertText('\n---\n')
  }

  const clearFormatting = () => {
    // Remove common formatting marks
    const cleaned = value
      .replace(/\*\*/g, '')
      .replace(/__/g, '')
      .replace(/_/g, '')
      .replace(/^• /gm, '')
      .replace(/^\d+\. /gm, '')
      .replace(/---/g, '')
    onChange(cleaned)
  }

  // Parse and render preview with formatting
  const renderPreview = (text: string) => {
    let formatted = text
      // Bold
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Underline
      .replace(/__(.*?)__/g, '<u>$1</u>')
      // Italic
      .replace(/_(.*?)_/g, '<em>$1</em>')
      // Line breaks
      .replace(/\n/g, '<br/>')
      // Dividers
      .replace(/---/g, '<hr class="my-2 border-gray-300"/>')
    
    return { __html: formatted }
  }

  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      
      {/* Toolbar */}
      <div className="bg-gray-50 border border-gray-300 rounded-t-lg p-2 flex flex-wrap gap-1">
        {/* Text Formatting */}
        <div className="flex gap-1 pr-2 border-r border-gray-300">
          <button
            type="button"
            onClick={formatBold}
            className="p-2 hover:bg-gray-200 rounded transition-colors"
            title="Negrito"
          >
            <span className="font-bold">B</span>
          </button>
          <button
            type="button"
            onClick={formatItalic}
            className="p-2 hover:bg-gray-200 rounded transition-colors"
            title="Itálico"
          >
            <span className="italic">I</span>
          </button>
          <button
            type="button"
            onClick={formatUnderline}
            className="p-2 hover:bg-gray-200 rounded transition-colors"
            title="Sublinhado"
          >
            <span className="underline">U</span>
          </button>
        </div>

        {/* Lists */}
        <div className="flex gap-1 px-2 border-r border-gray-300">
          <button
            type="button"
            onClick={insertBulletPoint}
            className="p-2 hover:bg-gray-200 rounded transition-colors"
            title="Lista com marcadores"
          >
            • —
          </button>
          <button
            type="button"
            onClick={insertNumberedList}
            className="p-2 hover:bg-gray-200 rounded transition-colors"
            title="Lista numerada"
          >
            1.—
          </button>
        </div>

        {/* Special */}
        <div className="flex gap-1 px-2 border-r border-gray-300">
          <button
            type="button"
            onClick={insertDivider}
            className="p-2 hover:bg-gray-200 rounded transition-colors"
            title="Linha divisória"
          >
            ―
          </button>
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="p-2 hover:bg-gray-200 rounded transition-colors relative"
            title="Inserir emoji"
          >
            😊
          </button>
        </div>

        {/* Clear */}
        <div className="flex gap-1 px-2">
          <button
            type="button"
            onClick={clearFormatting}
            className="px-3 py-1 text-sm hover:bg-gray-200 rounded transition-colors text-gray-600"
            title="Limpar formatação"
          >
            Limpar
          </button>
        </div>

        {/* Emoji Picker */}
        {showEmojiPicker && (
          <div className="absolute z-10 mt-10 bg-white border border-gray-300 rounded-lg shadow-lg p-3 w-80">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700">Escolha um emoji</span>
              <button
                type="button"
                onClick={() => setShowEmojiPicker(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
            <div className="grid grid-cols-10 gap-1">
              {popularEmojis.map((emoji, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => insertEmoji(emoji)}
                  className="p-2 text-xl hover:bg-gray-100 rounded transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Editor and Preview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Editor */}
        <div>
          <div className="text-xs text-gray-500 mb-1">Editor</div>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onSelect={(e) => {
              const target = e.target as HTMLTextAreaElement
              setSelectionStart(target.selectionStart)
              setSelectionEnd(target.selectionEnd)
            }}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mega-500 font-mono text-sm"
            rows={rows}
            placeholder={placeholder}
          />
        </div>

        {/* Preview */}
        <div>
          <div className="text-xs text-gray-500 mb-1">Visualização</div>
          <div className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50 min-h-[150px]">
            <div 
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={renderPreview(value)}
            />
          </div>
        </div>
      </div>

      {helpText && (
        <p className="text-xs text-gray-500 mt-1">
          {helpText}
        </p>
      )}

      {/* Formatting Guide */}
      <div className="mt-2 p-3 bg-blue-50 rounded-lg">
        <p className="text-xs text-blue-700 font-medium mb-1">💡 Dicas de formatação:</p>
        <div className="text-xs text-blue-600 space-y-1">
          <p>• Use **texto** para <strong>negrito</strong></p>
          <p>• Use _texto_ para <em>itálico</em></p>
          <p>• Use __texto__ para <u>sublinhado</u></p>
          <p>• Adicione emojis para chamar atenção 🎯</p>
          <p>• Use números (1. 2. 3.) ou bullets (•) para listas</p>
        </div>
      </div>
    </div>
  )
}