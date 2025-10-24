'use client';

import React from 'react';
import { Loader2, Edit } from 'lucide-react';

import { Button, Input } from '@/components/ui';
import { useToast } from '@/components/ui/toast';

import styles from './InlineEdit.module.scss';

export type InlineEditProps = {
  value: string;
  onSave: (newValue: string) => Promise<void>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  displayClassName?: string;
  // Text styling options
  fontWeight?: number;
  fontSize?: string;
  // Validation
  validate?: (value: string) => string | null;
  // Labels
  saveLabel?: string;
  cancelLabel?: string;
  loadingLabel?: string;
  errorLabel?: string;
};

export function InlineEdit({
  value,
  onSave,
  placeholder = 'Enter value',
  disabled = false,
  className,
  inputClassName,
  displayClassName,
  fontWeight = 400,
  fontSize = 'body-md',
  validate,
  saveLabel = 'Save',
  cancelLabel = 'Cancel',
  loadingLabel = 'Saving...',
  errorLabel = 'Failed to save',
}: InlineEditProps) {
  const { toast } = useToast();

  const [isEditing, setIsEditing] = React.useState(false);
  const [tempValue, setTempValue] = React.useState('');
  const [editError, setEditError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  const handleStartEditing = React.useCallback(() => {
    if (disabled || isSaving) return;
    setIsEditing(true);
    setTempValue(value);
    setEditError(null);
  }, [value, disabled, isSaving]);

  const handleCancelEditing = React.useCallback(() => {
    setIsEditing(false);
    setTempValue('');
    setEditError(null);
  }, []);

  const handleSave = React.useCallback(async () => {
    const trimmed = tempValue.trim();

    // Validation
    if (!trimmed) {
      setEditError('Value is required');
      return;
    }

    if (validate) {
      const validationError = validate(trimmed);
      if (validationError) {
        setEditError(validationError);
        return;
      }
    }

    if (trimmed === value) {
      handleCancelEditing();
      return;
    }

    setIsSaving(true);
    try {
      await onSave(trimmed);
      setIsEditing(false);
      setTempValue('');
      setEditError(null);
    } catch (error) {
      setEditError(errorLabel);
      toast({
        title: errorLabel,
        description: 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }, [tempValue, value, validate, onSave, handleCancelEditing, errorLabel, toast]);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleCancelEditing();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        handleSave();
      }
    },
    [handleCancelEditing, handleSave],
  );

  if (isEditing) {
    return (
      <div className={`${styles.inlineEditContainer} ${className || ''}`}>
        <Input
          value={tempValue}
          onChange={(event) => setTempValue(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || isSaving}
          className={`${styles.inlineEditInput} ${inputClassName || ''}`}
          placeholder={placeholder}
          autoFocus
          style={{ fontWeight, fontSize }}
        />
        <div className={styles.inlineEditActions}>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCancelEditing}
            disabled={isSaving}
            className={styles.inlineEditButton}
          >
            {cancelLabel}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={disabled || isSaving}
            className={styles.inlineEditButton}
          >
            {isSaving ? (
              <>
                <Loader2 className={styles.spinner} aria-hidden="true" />
                {loadingLabel}
              </>
            ) : (
              saveLabel
            )}
          </Button>
        </div>
        {editError && <div className={styles.inlineEditError}>{editError}</div>}
      </div>
    );
  }

  return (
    <div
      className={`${styles.editContainer} ${displayClassName || ''} ${className || ''}`}
      onClick={handleStartEditing}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleStartEditing();
        }
      }}
      aria-label={`Edit ${placeholder.toLowerCase()}`}
    >
      <span className={styles.editDisplay} style={{ fontWeight, fontSize }}>
        {value}
      </span>
      <Edit className={styles.editIcon} aria-hidden="true" />
    </div>
  );
}
