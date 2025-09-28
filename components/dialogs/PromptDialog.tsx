'use client';

import * as React from 'react';
import clsx from 'clsx';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import styles from './prompt-dialog.module.scss';

export type PromptDialogOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  defaultValue?: string;
  placeholder?: string;
  inputLabel?: string;
  trim?: boolean;
  allowEmpty?: boolean;
  validate?: (value: string) => string | null;
};

type PromptDialogContextValue = {
  prompt: (options: PromptDialogOptions) => Promise<string | null>;
};

const PromptDialogContext = React.createContext<PromptDialogContextValue | null>(null);

export function usePromptDialog() {
  const context = React.useContext(PromptDialogContext);
  if (!context) {
    throw new Error('usePromptDialog must be used within a PromptDialogProvider');
  }
  return context.prompt;
}

type DialogState = {
  options: PromptDialogOptions | null;
};

function PromptDialogContent({
  open,
  options,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  options: PromptDialogOptions | null;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}) {
  const [value, setValue] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const inputId = React.useId();
  const inputName = 'prompt-dialog-value';

  React.useEffect(() => {
    if (open && options) {
      setValue(options.defaultValue ?? '');
      setError(null);
    }
  }, [open, options]);

  const handleSubmit = React.useCallback(
    (event?: React.FormEvent<HTMLFormElement>) => {
      let submittedValue = value;
      if (event) {
        event.preventDefault();
        if (event.currentTarget instanceof HTMLFormElement) {
          const field = event.currentTarget.elements.namedItem(
            inputName,
          ) as HTMLInputElement | null;
          if (field) submittedValue = field.value;
        }
      }
      if (!options) return;
      const raw = options.trim === false ? submittedValue : submittedValue.trim();
      const validator = options.validate;
      const validationError = validator
        ? validator(raw)
        : !options.allowEmpty && raw.length === 0
          ? 'Please enter a value.'
          : null;
      if (validationError) {
        setError(validationError);
        return;
      }
      onConfirm(raw);
    },
    [onConfirm, options, value, inputName],
  );

  const confirmLabel = options?.confirmLabel ?? 'Confirm';
  const cancelLabel = options?.cancelLabel ?? 'Cancel';
  const hasExplicitDescription = Boolean(options?.description);
  const fallbackDescription =
    options?.description ??
    (options?.inputLabel
      ? `Enter a value for ${options.inputLabel} and choose ${confirmLabel}.`
      : `Provide a value, then choose ${confirmLabel} to continue.`);

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onCancel() : undefined)}>
      <DialogContent showCloseButton={false} className={styles.content}>
        <form onSubmit={handleSubmit} className={styles.form}>
          <DialogHeader>
            <DialogTitle>{options?.title}</DialogTitle>
            <DialogDescription
              className={clsx(
                styles.description,
                !hasExplicitDescription && styles.descriptionHidden,
              )}
            >
              {fallbackDescription}
            </DialogDescription>
          </DialogHeader>
          <div className={styles.fieldGroup}>
            {options?.inputLabel ? (
              <Label htmlFor={inputId} className={styles.label}>
                {options.inputLabel}
              </Label>
            ) : null}
            <Input
              id={inputId}
              name={inputName}
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                if (error) setError(null);
              }}
              placeholder={options?.placeholder}
              autoFocus
            />
            {error ? <p className={styles.error}>{error}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              {cancelLabel}
            </Button>
            <Button type="submit">{confirmLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PromptDialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<DialogState>({ options: null });
  const resolverRef = React.useRef<((value: string | null) => void) | null>(null);
  const closingRef = React.useRef(false);

  const settle = React.useCallback((result: string | null) => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    setState({ options: null });
    if (resolver) resolver(result);
  }, []);

  const handleCancel = React.useCallback(() => {
    if (closingRef.current) {
      closingRef.current = false;
      return;
    }
    settle(null);
  }, [settle]);

  const handleConfirm = React.useCallback(
    (value: string) => {
      closingRef.current = true;
      settle(value);
    },
    [settle],
  );

  const prompt = React.useCallback((options: PromptDialogOptions) => {
    return new Promise<string | null>((resolve) => {
      resolverRef.current = resolve;
      closingRef.current = false;
      setState({ options });
    });
  }, []);

  const contextValue = React.useMemo<PromptDialogContextValue>(() => ({ prompt }), [prompt]);

  return (
    <PromptDialogContext.Provider value={contextValue}>
      {children}
      <PromptDialogContent
        open={state.options != null}
        options={state.options}
        onCancel={handleCancel}
        onConfirm={handleConfirm}
      />
    </PromptDialogContext.Provider>
  );
}
