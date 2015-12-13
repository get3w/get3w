package storage

import (
	"strings"

	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/pkg/fmatter"
	"github.com/get3w/get3w/repos"
)

// getPostKey get post file key
func (site *Site) getPostKey(postFolder, fileName string) string {
	return site.GetSourceKey(repos.PrefixPosts, postFolder, fileName)
}

// GetPosts get page's posts
func (site *Site) GetPosts(folder string) ([]*get3w.Post, error) {
	if site.posts == nil {
		site.posts = make(map[string][]*get3w.Post)
	}

	prefix := site.GetSourcePrefix(repos.PrefixPosts, folder)

	posts, ok := site.posts[strings.ToLower(prefix)]
	if !ok {
		posts = []*get3w.Post{}
		files, _ := site.GetAllFiles(prefix)
		for _, file := range files {
			if file.IsDir {
				continue
			}
			post := site.getPost(file)
			if post != nil {
				posts = append(posts, post)
			}
		}
		site.posts[strings.ToLower(prefix)] = posts
	}

	return posts, nil
}

func (site *Site) getPost(file *get3w.File) *get3w.Post {
	data, _ := site.Read(site.GetSourceKey(file.Path))
	if data == nil {
		return nil
	}

	post := &get3w.Post{}
	ext := getExt(file.Path)
	content := fmatter.Read(data, post)
	post.Content = getStringByExt(ext, content)
	if post.ID == "" {
		post.ID = removeExt(file.Name)
	}
	if post.Title == "" {
		post.Title = post.ID
	}
	if post.URL == "" {
		url := "posts/" + post.ID + ".html"
		post.URL = url
	}

	return post
}
