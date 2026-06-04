import { defineConfig } from 'tinacms';

export default defineConfig({
  branch: 'main',
  clientId: '',
  token: '',

  build: {
    outputFolder: 'admin',
    publicFolder: 'public',
  },
  media: {
    tina: {
      mediaRoot: 'public/images',
      publicFolder: 'public',
    },
  },
  schema: {
    collections: [
      {
        name: 'posts',
        label: '文章',
        path: 'src/content/posts',
        format: 'mdx',
        fields: [
          {
            type: 'string',
            name: 'title',
            label: '标题',
            isTitle: true,
            required: true,
          },
          {
            type: 'datetime',
            name: 'date',
            label: '发布日期',
            required: true,
          },
          {
            type: 'string',
            name: 'tags',
            label: '标签',
            list: true,
            ui: {
              bullet: ',',
            },
          },
          {
            type: 'string',
            name: 'description',
            label: '描述',
          },
          {
            type: 'boolean',
            name: 'draft',
            label: '草稿',
          },
          {
            type: 'mdx',
            name: 'body',
            label: '正文',
          },
        ],
      },
    ],
  },
});
