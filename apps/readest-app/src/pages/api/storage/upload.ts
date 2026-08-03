import type { NextApiRequest, NextApiResponse } from 'next';
import { createSupabaseAdminClient } from '@/utils/supabase';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import {
  getStoragePlanData,
  validateUserAndToken,
  STORAGE_QUOTA_GRACE_BYTES,
} from '@/utils/access';
import { getUploadSignedUrl, isSafeObjectKeyName } from '@/utils/object';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user, token } = await validateUserAndToken(req.headers['authorization']);
  if (!user || !token) {
    return res.status(403).json({ error: 'Not authenticated' });
  }

  const { fileName, fileSize, bookHash } = req.body;

  // Reject object-key path traversal before building any key. `fileName` is
  // fully client-controlled and is interpolated into `${user.id}/${fileName}`;
  // without this an attacker escapes their own prefix into another user's
  // namespace (GHSA-mfmj-2frf-vhgw).
  if (
    typeof bookHash !== 'string' ||
    !/^[a-f0-9]{32}$/i.test(bookHash) ||
    !isSafeObjectKeyName(fileName, bookHash)
  ) {
    return res.status(400).json({ error: 'Invalid book file' });
  }
  if (typeof fileSize !== 'number' || !Number.isSafeInteger(fileSize) || fileSize <= 0) {
    return res.status(400).json({ error: 'Invalid file size' });
  }

  try {
    const fileKey = `${user.id}/${fileName}`;
    const supabase = createSupabaseAdminClient();
    const { data: existingRecord, error: fetchError } = await supabase
      .from('files')
      .select('*')
      .eq('user_id', user.id)
      .eq('file_key', fileKey)
      .limit(1)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      return res.status(500).json({ error: fetchError.message });
    }

    const { usage, quota } = getStoragePlanData(token);
    const previousSize = existingRecord?.file_size ?? 0;
    const nextUsage = usage - previousSize + fileSize;
    if (nextUsage > quota + STORAGE_QUOTA_GRACE_BYTES) {
      return res.status(403).json({ error: 'Insufficient storage quota', usage });
    }

    if (existingRecord) {
      const { error: updateError } = await supabase
        .from('files')
        .update({ book_hash: bookHash, file_size: fileSize, deleted_at: null })
        .eq('id', existingRecord.id)
        .eq('user_id', user.id);
      if (updateError) return res.status(500).json({ error: updateError.message });
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('files')
        .insert([
          {
            user_id: user.id,
            book_hash: bookHash ?? null,
            file_key: fileKey,
            file_size: fileSize,
          },
        ])
        .select()
        .single();
      console.log('Inserted record:', inserted);
      if (insertError) return res.status(500).json({ error: insertError.message });
    }

    try {
      const uploadUrl = await getUploadSignedUrl(fileKey, fileSize, 1800);

      res.status(200).json({
        uploadUrl,
        fileKey,
        usage: nextUsage,
        quota,
      });
    } catch (error) {
      console.error('Error creating presigned post:', error);
      res.status(500).json({ error: 'Could not create presigned post' });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
