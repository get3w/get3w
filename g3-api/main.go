package main

import (
	"github.com/get3w/get3w/g3-api/api/status"
	"github.com/get3w/get3w/g3-api/pkg/api"

	log "github.com/Sirupsen/logrus"
	"github.com/labstack/echo"
	"github.com/labstack/echo/middleware"
)

func main() {
	e := echo.New()

	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	e.Use(api.StoreHeaders())

	e.SetHTTPErrorHandler(func(err error, c *echo.Context) {
		if he, ok := err.(*echo.HTTPError); ok {
			api.Error(c, he.Code(), he)
		} else {
			api.ErrorInternal(c, err)
		}
	})

	// e.Get("/static/proxy.html", api.StaticProxy)
	// e.Get("/static/xdomain.min.js", api.StaticXDomain)
	//
	// // Apps Files start
	// e.Post("/apps/:owner/:name/files/actions/checksum", files.Checksum)
	// e.Post("/apps/:owner/:name/files/actions/push", files.Push)
	// e.Delete("/apps/:owner/:name/files/*", files.Delete)
	// e.Put("/apps/:owner/:name/files/*", files.Edit)
	// e.Get("/apps/:owner/:name/*", files.Get)
	// e.Get("/apps/:owner/:name/files", files.List)
	// e.Get("/apps/:owner/:name/files/*", files.List)
	//
	// // Apps Folders start
	// e.Post("/apps/:owner/:name/folders", folders.Create)
	// e.Delete("/apps/:owner/:name/folders", folders.Delete)
	//
	// // Apps start
	// e.Post("/apps", apps.Create)
	// e.Delete("/apps/:owner/:name", apps.Delete)
	// e.Patch("/apps/:owner/:name", apps.Edit)
	// e.Get("/apps/:owner/:name", apps.Get)
	// e.Get("/apps", apps.List)
	// e.Post("/apps/:owner/:name/actions/load", apps.Load)
	// e.Post("/apps/:owner/:name/actions/publish", apps.Publish)
	// e.Post("/apps/:owner/:name/actions/save", apps.Save)
	// e.Post("/apps/:owner/:name/actions/star", apps.Star)

	// Status start
	e.Get("/status", status.Get)

	e.Static("/*", "C:\\get3w-js\\public\\get3w\\")

	e.Run(port)
}

var port string

func init() {
	log.SetFormatter(&log.JSONFormatter{})
	port = ":49393"
}
