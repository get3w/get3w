package storage

import (
	"strings"

	"gopkg.in/yaml.v2"

	"github.com/fatih/structs"
	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/pkg/fmatter"
)

// postKey get post file key
func (site *Site) postKey(postFolder, fileName string) string {
	return site.key(PrefixPosts, postFolder, fileName)
}

// GetPosts get site's posts
func (site *Site) GetPosts(path string) []*get3w.Post {
	path = strings.ToLower(path)
	posts := []*get3w.Post{}
	for _, post := range site.Current.Posts {
		if path != "" && !strings.HasPrefix(strings.ToLower(post.Path), path) {
			continue
		}
		posts = append(posts, post)
	}

	return posts
}

func getRelatedPosts(posts []*get3w.Post, post *get3w.Post) []*get3w.Post {
	relatedPosts := []*get3w.Post{}
	for _, item := range posts {
		if post.ID != item.ID {
			relatedPosts = append(relatedPosts, item)
		}
	}
	return relatedPosts
}

func (site *Site) getPost(file *get3w.File) *get3w.Post {
	post := &get3w.Post{}

	data, _ := site.Storage.Read(site.Storage.GetSourceKey(file.Path))
	if data == nil {
		return post
	}

	front, content := fmatter.ReadRaw(data)
	if len(front) > 0 {
		yaml.Unmarshal(front, post)
	}

	ext := getExt(file.Path)
	post.Content = getStringByExt(ext, content)
	path := strings.Trim(file.Path[len(PrefixPosts):], "/")
	post.ID = removeExt(path)
	post.Path = path
	if post.Title == "" {
		post.Title = post.ID
	}
	post.URL = "/posts/" + post.ID + ".html"

	vars := make(map[string]interface{})
	if len(front) > 0 {
		yaml.Unmarshal(front, vars)
	}
	post.AllParameters = structs.Map(post)
	for key, val := range vars {
		if _, ok := post.AllParameters[key]; !ok {
			post.AllParameters[key] = val
		}
	}

	return post
}
