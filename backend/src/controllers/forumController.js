const db = require('../config/database.js');

async function getCoursePosts(req, res) {
  try {
    const courseId = parseInt(req.params.courseId);
    if (isNaN(courseId)) {
      return res.status(400).json({ error: 'Invalid course ID' });
    }

    const posts = await db.query(`
      SELECT fp.*, u.full_name as author_name, u.username as author_username,
             (SELECT COUNT(*) FROM forum_comments WHERE post_id = fp.id) as comment_count
      FROM forum_posts fp
      JOIN users u ON fp.author_id = u.id
      WHERE fp.course_id = ?
      ORDER BY fp.created_at DESC
    `, [courseId]);

    res.json({ success: true, data: posts });
  } catch (error) {
    console.error('Get forum posts error:', error);
    res.status(500).json({ error: 'Failed to load posts' });
  }
}

async function getPost(req, res) {
  try {
    const postId = parseInt(req.params.id);
    if (isNaN(postId)) {
      return res.status(400).json({ error: 'Invalid post ID' });
    }

    const post = await db.getOne(`
      SELECT fp.*, u.full_name as author_name, u.username as author_username
      FROM forum_posts fp
      JOIN users u ON fp.author_id = u.id
      WHERE fp.id = ?
    `, [postId]);

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const comments = await db.query(`
      SELECT fc.*, u.full_name as author_name, u.username as author_username
      FROM forum_comments fc
      JOIN users u ON fc.author_id = u.id
      WHERE fc.post_id = ?
      ORDER BY fc.created_at ASC
    `, [postId]);

    res.json({ success: true, data: { post, comments } });
  } catch (error) {
    console.error('Get post error:', error);
    res.status(500).json({ error: 'Failed to load post' });
  }
}

async function createPost(req, res) {
  try {
    const { courseId, title, content } = req.body;
    if (!courseId || !title || !content) {
      return res.status(400).json({ error: 'Missing required fields: courseId, title, content' });
    }

    const result = await db.query(`
      INSERT INTO forum_posts (author_id, course_id, title, content) VALUES (?, ?, ?, ?)
    `, [req.user.userId, courseId, title, content]);

    res.status(201).json({ success: true, id: result.insertId, message: 'Post created' });
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ error: 'Failed to create post' });
  }
}

async function createComment(req, res) {
  try {
    const postId = parseInt(req.params.postId);
    if (isNaN(postId)) {
      return res.status(400).json({ error: 'Invalid post ID' });
    }

    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const result = await db.query(`
      INSERT INTO forum_comments (post_id, author_id, content) VALUES (?, ?, ?)
    `, [postId, req.user.userId, content]);

    res.status(201).json({ success: true, id: result.insertId, message: 'Comment added' });
  } catch (error) {
    console.error('Create comment error:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
}

async function deletePost(req, res) {
  try {
    const postId = parseInt(req.params.id);
    if (isNaN(postId)) {
      return res.status(400).json({ error: 'Invalid post ID' });
    }

    const post = await db.getOne('SELECT * FROM forum_posts WHERE id = ?', [postId]);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (post.author_id !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await db.query('DELETE FROM forum_posts WHERE id = ?', [postId]);
    res.json({ success: true, message: 'Post deleted' });
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({ error: 'Failed to delete post' });
  }
}

module.exports = { getCoursePosts, getPost, createPost, createComment, deletePost };