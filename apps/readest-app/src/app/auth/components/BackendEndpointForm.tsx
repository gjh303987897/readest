'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { Server, CheckCircle2 } from 'lucide-react';

import { connectBackendEndpoint } from '@/services/backendEndpoint';
import type { BackendConnection } from '@/services/backendEndpoint';
import { applyBackendConnection } from '@/utils/supabase';

interface BackendEndpointFormProps {
  initialEndpoint: string;
  onConnected: (connection: BackendConnection) => void;
}

export const BackendEndpointForm = ({ initialEndpoint, onConnected }: BackendEndpointFormProps) => {
  const [endpoint, setEndpoint] = useState(initialEndpoint);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(!!initialEndpoint);
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setConnecting(true);
    setError('');
    try {
      const connection = await connectBackendEndpoint(endpoint);
      applyBackendConnection(connection);
      setEndpoint(connection.endpoint);
      setConnected(true);
      onConnected(connection);
    } catch (reason) {
      setConnected(false);
      setError(reason instanceof Error ? reason.message : 'Unable to connect to endpoint');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className='mb-6 w-full'>
      <label htmlFor='backend-endpoint' className='mb-2 block text-sm font-medium'>
        Server endpoint
      </label>
      <div className='flex gap-2'>
        <label className='input input-bordered eink-bordered flex h-11 min-w-0 flex-1 items-center gap-2'>
          <Server aria-hidden='true' className='h-4 w-4 shrink-0 opacity-60' />
          <input
            id='backend-endpoint'
            type='url'
            required
            value={endpoint}
            onChange={(event) => {
              setEndpoint(event.target.value);
              setConnected(false);
            }}
            placeholder='https://reader.example.com'
            className='min-w-0 flex-1 bg-transparent outline-none'
            autoCapitalize='none'
            autoCorrect='off'
            spellCheck={false}
          />
          {connected && <CheckCircle2 aria-label='Connected' className='h-4 w-4 shrink-0' />}
        </label>
        <button
          type='submit'
          className='btn btn-contrast h-11 min-h-11 shrink-0'
          disabled={connecting}
        >
          {connecting ? 'Connecting...' : 'Connect'}
        </button>
      </div>
      {error && (
        <p role='alert' className='text-error mt-2 text-sm'>
          {error}
        </p>
      )}
    </form>
  );
};
