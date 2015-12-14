package storage

import (
	"fmt"
	"math"

	"github.com/fatih/structs"
	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/pkg/fmatter"
	"gopkg.in/yaml.v2"
)

// GetPages parse SUMMARY.md file and returns pages
func (site *Site) GetPages() []*get3w.Page {
	if site.pages == nil {
		pages := []*get3w.Page{}

		for _, summary := range site.Summaries {
			page := site.getPage(summary)
			pages = append(pages, page)
		}

		site.pages = pages
	}

	return site.pages
}

func (site *Site) getPage(summary *get3w.PageSummary) *get3w.Page {
	page := &get3w.Page{}

	data, _ := site.Read(site.GetSourceKey(summary.Path))

	front, content := fmatter.ReadRaw(data)
	if len(front) > 0 {
		yaml.Unmarshal(front, page)
	}

	ext := getExt(summary.Path)
	page.Content = getStringByExt(ext, content)

	page.Name = summary.Name
	page.Path = summary.Path
	if page.URL == "" {
		page.URL = summary.URL
	}
	page.Posts = site.GetPosts(page.PostPath)
	fmt.Println(page.Posts)

	if len(summary.Children) > 0 {
		for _, child := range summary.Children {
			childPage := site.getPage(child)
			page.Children = append(page.Children, childPage)
		}
	}

	vars := make(map[string]interface{})
	if len(front) > 0 {
		yaml.Unmarshal(front, vars)
	}
	page.All = structs.Map(page)
	for key, val := range vars {
		if _, ok := page.All[key]; !ok {
			page.All[key] = val
		}
	}

	return page
}

func getPaginatorPath(page int, url string) string {
	if page == 1 {
		return url
	}
	return fmt.Sprintf("%s%d%s", removeExt(url), page, getExt(url))
}

func (site *Site) getPagePaginators(page *get3w.Page) []*get3w.Paginator {
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

// WritePage write content to page file
func (site *Site) WritePage(page *get3w.Page) error {
	data, err := fmatter.Write(page, []byte(page.Content))
	if err != nil {
		return err
	}
	return site.Write(site.GetSourceKey(page.Path), data)
}

// DeletePage delete page file
func (site *Site) DeletePage(summary *get3w.PageSummary) error {
	return site.Delete(site.GetSourceKey(summary.Path))
}
