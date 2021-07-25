/************************************************
 * This code is a function for retrieve blog data from AWS S3.
 * Deploy on AWS Lambda (triggered by AWS API Gateway)
 ************************************************/
exports.handler = async (event, context, callback) => {
  // import module for submitting request.
  const axios = require('axios');

  // import modules
  const _ = require('lodash');
  const AWS = require('aws-sdk');

  // constant
  // aws for blogs bucket
  AWS.config.update({
    accessKeyId: process.env.BLOG_AWS_ACCESS_KEY_ID || '{YOUR_BLOG_AWS_ACCESS_KEY_ID}',
    secretAccessKey: process.env.BLOG_AWS_SECRET_ACCESS_KEY || '{YOUR_BLOG_AWS_SECRET_ACCESS_KEY}',
    region: process.env.BLOG_AWS_REGION || 'us-east-1',
  });
  // aws s3
  const aws_s3_url = process.env.BLOGS_AWS_S3_URL || 'https://s3.amazonaws.com';
  const aws_s3_bucket = process.env.BLOGS_AWS_S3_BUCKET || '{YOUR_BLOG_AWS_S3_BUCKET}';
  const s3 = new AWS.S3();

  // function get blog
  const getBlog = async (category_id, post_id, params, include_html) => {
    try {
      const res = await axios.get(`${aws_s3_url}/${aws_s3_bucket}/blog/${category_id}/${post_id ? `posts/${post_id}/` : ''}data.json`, { params: { ...params } })
        .catch(error => { return null; });

      if (res && res.data && include_html && res.data.include) {
        const resHtml = await axios.get(`${aws_s3_url}/${aws_s3_bucket}/blog/${category_id}/${post_id ? `posts/${post_id}/` : ''}data.html`, { params: { ...params } })
          .catch(error => { return null; });
        if (resHtml && resHtml.data) {
          res.data.html = resHtml.data;
        }
      }

      return res.data;
    } catch (error) { return null; }
  };

  // function get blogs
  const getAllBlogs = async () => {
    const params = {
      Bucket: aws_s3_bucket,
      Delimiter: '',
      Prefix: 'blog/',
    };

    try {
      const listBlogs = params => new Promise(resolve => {
        s3.listObjectsV2(params, async (err, data) => {
          if (err) {
            resolve(null);
          } else {
            let blogsData = data.Contents && data.Contents.filter(c => c.Key && c.Key.endsWith('data.json')).map(c => _.slice(c.Key.split('/'), 1, c.Key.split('/').length - 1)).map(p => { return { category_id: p[0], post_id: p[2] ? p[2] : undefined }; });

            for (let i = 0; i < blogsData.length; i++) {
              const blog = blogsData[i];

              let blogData = await getBlog(blog.category_id, blog.post_id);
              blogData = blogData ? blogData : {};
              blogsData[i] = { ...blog, ...blogData };
            }

            blogsData = blogsData.filter(blog => blog.include && (!blog.post_id || blogsData.findIndex(_blog => !_blog.post_id && _blog.category_id === blog.category_id && !_blog.include) < 0));

            resolve(blogsData);
          }
        });
      });

      const data = await listBlogs(params);
      return data;
    } catch (error) { return null; }
  };

  // response data variable
  let response = null;

  if (event.queryStringParameters && event.queryStringParameters.category_id) {
    // get blog
    response = await getBlog(event.queryStringParameters.category_id, event.queryStringParameters.post_id, event.queryStringParameters, event.queryStringParameters.include_html === 'true');
  }
  else {
    // get all blogs
    response = await getAllBlogs();
  }

  // return data
  return response;
};