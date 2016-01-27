package storage

import (
	"strings"

	"gopkg.in/yaml.v2"

	"github.com/fatih/structs"
	"github.com/get3w/get3w"
	"github.com/get3w/get3w/engines/liquid"
)

// LoadSitePosts load posts for current site
func (parser *Parser) LoadSitePosts() {
	posts := []*get3w.Post{}
	files, _ := parser.Storage.GetAllFiles(parser.prefix(PrefixPosts))
	for _, file := range files {
		if file.IsDir {
			continue
		}
		post := parser.getPost(file)
		if post != nil {
			posts = append(posts, post)
		}
	}

	parser.Current.Posts = posts
}

// postKey get post file key
func (parser *Parser) postKey(postFolder, fileName string) string {
	return parser.key(PrefixPosts, postFolder, fileName)
}

// GetPosts get site's posts
func (parser *Parser) GetPosts(path string) []*get3w.Post {
	path = strings.ToLower(path)
	posts := []*get3w.Post{}
	for _, post := range parser.Current.Posts {
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

func (parser *Parser) getPost(file *get3w.File) *get3w.Post {
	post := &get3w.Post{}

	front, content := parser.read(post, file.Path)

	ext := getExt(file.Path)
	post.Content = getStringByExt(ext, content)
	post.ID = removeExt(file.Name)
	post.Path = file.Path
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

// parsePost parse post
func (parser *Parser) parsePost(post *get3w.Post) (string, error) {
	layoutContent := post.Content
	layout := parser.getLayout(post.Layout)
	if layout != nil {
		layoutContent = layout.FinalContent
	}

	parser.Current.AllParameters["related_posts"] = getRelatedPosts(parser.Current.Posts, post)

	data := map[string]interface{}{
		"site": parser.Current.AllParameters,
		"page": post.AllParameters,
	}

	liquidParser := liquid.New(parser.Path)
	content, err := liquidParser.Parse(post.Content, data)
	if err != nil {
		return "", err
	}
	data["content"] = content
	parsedContent, err := liquidParser.Parse(layoutContent, data)
	if err != nil {
		return "", err
	}

	return parsedContent, nil
}
