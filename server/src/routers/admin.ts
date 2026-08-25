import { z } from 'zod';
import { adminProcedure, router } from '../trpc';
import { mapProfile } from '../mappers';

export const adminRouter = router({
  listUsers: adminProcedure.query(async ({ ctx }) => {
    const users = await ctx.db.user.findMany({ orderBy: { createdAt: 'asc' } });
    const results = await Promise.all(
      users.map(async (user) => {
        const [rgLimits, notifPrefs] = await Promise.all([
          ctx.db.rgLimits.findUnique({ where: { userId: user.id } }),
          ctx.db.notificationPrefs.findUnique({ where: { userId: user.id } }),
        ]);
        return mapProfile(user, rgLimits, notifPrefs);
      })
    );
    return results;
  }),

  updateUser: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        patch: z.object({
          suspended: z.boolean().optional(),
          role: z.enum(['user', 'admin']).optional(),
          bonusBalance: z.number().optional(),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.update({
        where: { id: input.userId },
        data: {
          suspended: input.patch.suspended,
          role: input.patch.role,
          bonusBalance: input.patch.bonusBalance,
        },
      });
      const [rgLimits, notifPrefs] = await Promise.all([
        ctx.db.rgLimits.findUnique({ where: { userId: user.id } }),
        ctx.db.notificationPrefs.findUnique({ where: { userId: user.id } }),
      ]);
      return mapProfile(user, rgLimits, notifPrefs);
    }),
});
