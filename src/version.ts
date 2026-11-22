import { z } from 'zod';

const PackageSchema = z.object({ version: z.string() });

export const readVersion = (packageJson: string): string => PackageSchema.parse(JSON.parse(packageJson)).version;
