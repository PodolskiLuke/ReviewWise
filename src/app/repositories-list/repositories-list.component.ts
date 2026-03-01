import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ReviewWiseApiService } from '../services/reviewwise-api.service';

@Component({
  selector: 'app-repositories-list',
  imports: [CommonModule, FormsModule],
  templateUrl: './repositories-list.component.html',
  styleUrls: ['./repositories-list.component.scss']
})
export class RepositoriesListComponent implements OnInit {
  repositories: any[] = [];
  filteredRepositories: any[] = [];
  selectedRepo: any = null;
  searchTerm: string = '';
  loading = true;
  error: string | null = null;

  constructor(private api: ReviewWiseApiService) {}

  ngOnInit() {
    Promise.resolve().then(() => this.fetchRepositories());
  }

  fetchRepositories() {
    this.loading = true;
    this.error = null;
    this.api.getRepositories().subscribe({
      next: (repos) => {
        this.repositories = repos;
        this.filteredRepositories = repos;
        this.loading = false;
      },
      error: (err: HttpErrorResponse) => {
        if (err.status === 401 || err.status === 403) {
          this.error = 'Please log in to view repositories.';
        } else {
          this.error = 'Failed to load repositories.';
        }
        this.loading = false;
      }
    });
  }

  onSearch(term: string) {
    this.searchTerm = term;
    this.filteredRepositories = this.repositories.filter(repo =>
      repo.name.toLowerCase().includes(term.toLowerCase())
    );
  }

  selectRepo(repo: any) {
    this.selectedRepo = repo;
    // You can emit an event or navigate to PRs here
  }
}
