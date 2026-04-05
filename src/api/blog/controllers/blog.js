'use strict';

/**
 * blog controller
 */

const { createCoreController } = require('@strapi/strapi').factories;


module.exports = createCoreController('api::blog.blog', ({ strapi }) => ({
  // Method 1: Creating an entirely custom action
  async fullSlug(ctx) {
    console.log('running blog slug: ', ctx.params.slug)
    const entity = await strapi.db.query('api::blog.blog').findOne({
      where: {slug: ctx.params.slug},
      populate: ["category", "hero", "author", "createdBy"]
    });

    if (entity) {
      let author = null;
      
      // Priority 1: Use the new author field (relation to admin user)
      if (entity.author) {
        author = entity.author;
      }
      // Priority 2: Fall back to createdBy (old system)
      else if (entity.createdBy) {
        author = await strapi.db.query('plugin::users-permissions.user').findOne({
          where: {email: entity.createdBy.email},
          populate: ["profilePhoto"]
        });
      }
      
      entity.author = author;
      const allBlogs = await strapi.db.query('api::blog.blog').findMany({
        orderBy: { createdAt: 'asc' },
        select: ['slug']
      });

      const currentIndex = allBlogs.findIndex(blog => blog.slug === ctx.params.slug);
      const nextBlog = allBlogs[currentIndex + 1] || null;
      const prevBlog = allBlogs[currentIndex - 1] || null;

      entity.next_blog_post = nextBlog ? `/blog/${nextBlog.slug}` : null;
      entity.prev_blog_post = prevBlog ? `/blog/${prevBlog.slug}` : null;

      // Add random blog post
      let randomIndex;
      do {
        randomIndex = Math.floor(Math.random() * allBlogs.length);
      } while (randomIndex === currentIndex || randomIndex === currentIndex + 1 || randomIndex === currentIndex - 1);
      const randomBlog = allBlogs[randomIndex];
      entity.random_post = randomBlog ? `/blog/${randomBlog.slug}` : null;
    }

    ctx.body = entity;
  }
}));