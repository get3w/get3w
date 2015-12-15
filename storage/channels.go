package storage

import (
	"fmt"
	"math"

	"github.com/fatih/structs"
	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/pkg/fmatter"
	"gopkg.in/yaml.v2"
)

// GetChannels parse _pages.md file and returns channels
func (site *Site) GetChannels() []*get3w.Channel {
	if site.channels == nil {
		channels := []*get3w.Channel{}

		for _, link := range site.Links {
			page := site.getChannel(link)
			channels = append(channels, page)
		}

		site.channels = channels
	}

	return site.channels
}

func (site *Site) getChannel(link *get3w.Link) *get3w.Channel {
	channel := &get3w.Channel{}

	data, _ := site.Storage.Read(site.key(link.Path))

	front, content := fmatter.ReadRaw(data)
	if len(front) > 0 {
		yaml.Unmarshal(front, channel)
	}

	ext := getExt(link.Path)
	channel.Content = getStringByExt(ext, content)

	channel.Name = link.Name
	channel.Path = link.Path
	if channel.URL == "" {
		channel.URL = link.URL
	}
	channel.Posts = site.GetPosts(channel.PostPath)
	fmt.Println(channel.Posts)

	if len(link.Children) > 0 {
		for _, child := range link.Children {
			childChannel := site.getChannel(child)
			channel.Children = append(channel.Children, childChannel)
		}
	}

	vars := make(map[string]interface{})
	if len(front) > 0 {
		yaml.Unmarshal(front, vars)
	}
	channel.AllParameters = structs.Map(channel)
	for key, val := range vars {
		if _, ok := channel.AllParameters[key]; !ok {
			channel.AllParameters[key] = val
		}
	}

	return channel
}

func getPaginatorPath(page int, url string) string {
	if page == 1 {
		return url
	}
	return fmt.Sprintf("%s%d%s", removeExt(url), page, getExt(url))
}

func (site *Site) getChannelPaginators(page *get3w.Channel) []*get3w.Paginator {
	paginators := []*get3w.Paginator{}
	perPage := page.Paginate
	totalPosts := len(page.Posts)
	if perPage <= 0 || perPage >= totalPosts {
		paginator := &get3w.Paginator{
			Page:             1,
			PerPage:          perPage,
			Posts:            page.Posts,
			TotalPosts:       totalPosts,
			TotalPages:       1,
			PreviousPage:     0,
			PreviousPagePath: "",
			NextPage:         0,
			NextPagePath:     "",
			Path:             page.URL,
		}
		paginators = append(paginators, paginator)
	} else {
		totalPages := int(math.Ceil(float64(totalPosts) / float64(perPage)))
		for i := 1; i <= totalPages; i++ {
			previousPage := i - 1
			if previousPage < 0 {
				previousPage = 0
			}
			nextPage := i + 1
			if nextPage > totalPages {
				nextPage = 0
			}
			paginator := &get3w.Paginator{
				Page:             i,
				PerPage:          perPage,
				Posts:            page.Posts[perPage*(i-1) : perPage*i],
				TotalPosts:       totalPosts,
				TotalPages:       totalPages,
				PreviousPage:     previousPage,
				PreviousPagePath: getPaginatorPath(previousPage, page.URL),
				NextPage:         nextPage,
				NextPagePath:     getPaginatorPath(nextPage, page.URL),
				Path:             getPaginatorPath(i, page.URL),
			}
			paginators = append(paginators, paginator)
		}
	}
	return paginators
}

// WriteChannel write content to page file
func (site *Site) WriteChannel(channel *get3w.Channel) error {
	data, err := fmatter.Write(channel, []byte(channel.Content))
	if err != nil {
		return err
	}
	return site.Storage.Write(site.key(channel.Path), data)
}

// DeleteChannel delete page file
func (site *Site) DeleteChannel(link *get3w.Link) error {
	return site.Storage.Delete(site.key(link.Path))
}
